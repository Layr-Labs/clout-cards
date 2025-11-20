// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * @title CloutCards
 * @dev UUPS upgradeable contract for the Clout Cards application
 *
 * This contract implements the UUPS (Universal Upgradeable Proxy Standard) pattern,
 * allowing for upgradeable smart contracts while maintaining a single storage slot
 * for the implementation address.
 *
 * The contract uses OpenZeppelin's upgradeable patterns:
 * - Initializable: For one-time initialization instead of constructors
 * - UUPSUpgradeable: For upgrade functionality
 * - OwnableUpgradeable: For access control (owner can authorize upgrades)
 *
 * @custom:security-contact security@cloutcards.io
 */
contract CloutCards is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    
    ///////////////////////////////////////////////////////////////////////////
    // 1) Errors
    ///////////////////////////////////////////////////////////////////////////

    /**
     * @dev The house address is not a valid address (eg. `address(0)`)
     */
    error InvalidHouseAddress(address house);

    /**
     * @dev The caller is not authorized to perform this operation (not the house)
     */
    error UnauthorizedHouse(address caller);

    /**
     * @dev The maximum seats value is invalid (must be between 1 and 8)
     */
    error InvalidMaxSeats(uint8 maxSeats);

    /**
     * @dev The minimum buy-in is zero or invalid
     */
    error InvalidMinimumBuyIn(uint256 minimumBuyIn);

    /**
     * @dev The buy-in range is invalid (minimum must be <= maximum)
     */
    error InvalidBuyInRange(uint256 minimumBuyIn, uint256 maximumBuyIn);

    /**
     * @dev The big blind is larger than the maximum buy-in
     */
    error BigBlindExceedsMaxBuyIn(uint256 bigBlind, uint256 maximumBuyIn);

    /**
     * @dev The sit signature has expired
     */
    error SitSignatureExpired(uint256 expiry, uint256 currentTimestamp);

    /**
     * @dev The sit signature is invalid (not signed by house)
     */
    error InvalidSitSignature(address recovered, address house);

    /**
     * @dev The seat has changed since the signature was created
     */
    error SeatChanged(uint8 seatIndex, address expectedPlayer, address currentPlayer);

    /**
     * @dev The buy-in amount is invalid (must be between minimumBuyIn and maximumBuyIn)
     */
    error InvalidBuyInAmount(uint256 providedAmount, uint256 minimumBuyIn, uint256 maximumBuyIn);

    /**
     * @dev The rake percentage is invalid (must be between 0 and 10000)
     */
    error InvalidRakePercentage(uint16 perHandRake);

    /**
     * @dev The table already exists
     */
    error TableAlreadyExists(uint256 tableId);

    /**
     * @dev The small blind is zero or invalid
     */
    error InvalidSmallBlind(uint256 smallBlind);

    /**
     * @dev The blind range is invalid (small blind must be <= big blind)
     */
    error InvalidBlindRange(uint256 smallBlind, uint256 bigBlind);

    ///////////////////////////////////////////////////////////////////////////
    // 2) Events
    ///////////////////////////////////////////////////////////////////////////

    /**
     * @dev Emitted when the contract is initialized
     * @param owner The address that will own the contract
     * @param house The public address of the TEE authorizer
     */
    event CloutCardsInitialized(address indexed owner, address indexed house);

    /**
     * @dev Emitted when the house address is updated
     * @param previousHouse The previous house address
     * @param newHouse The new house address
     * @param owner The address of the owner that made the change
     */
    event HouseUpdated(address indexed previousHouse, address indexed newHouse, address indexed owner);

    /**
     * @dev Emitted when a new table is created
     * @param tableId The unique identifier for the table
     * @param maxSeats The maximum number of seats at the table
     * @param minimumBuyIn The minimum buy-in amount for the table
     * @param maximumBuyIn The maximum buy-in amount for the table
     * @param smallBlind The small blind amount for the table
     * @param bigBlind The big blind amount for the table
     * @param perHandRake The rake percentage for each hand
     */
    event TableCreated(
        uint256 indexed tableId,
        uint8 maxSeats,
        uint256 minimumBuyIn,
        uint256 maximumBuyIn,
        uint256 smallBlind,
        uint256 bigBlind,
        uint16 perHandRake
    );

    ///////////////////////////////////////////////////////////////////////////
    // 3) Structs/Enums
    ///////////////////////////////////////////////////////////////////////////

    struct Table {
        uint256 minimumBuyIn;            // The minimum buy-in amount for the table (in wei)
        uint256 maximumBuyIn;            // The maximum buy-in amount for the table         
        uint256 smallBlind;              // The small blind amount for the table (in wei)
        uint256 bigBlind;                // The big blind amount for the table (in wei)
        bool    isActive;                // Whether the table is active (true) or not (false)
        uint8   maxSeats;                // The maximum number of seats at the table (1-8)
        uint16  perHandRake;             // The rake percentage for each hand (0-10000)
        mapping(uint8 seatNumber => address seatOwner) seats; // The seats at the table (1-8)
    }

    ///////////////////////////////////////////////////////////////////////////
    // 4) Storage Variables
    ///////////////////////////////////////////////////////////////////////////

    /**
     * @dev The public address of the TEE (Trusted Execution Environment) authorizer
     * @notice This address represents the "house" that authorizes certain operations
     */
    address public house;

    /**
     * @dev The tables at the casino
     * @notice This mapping stores the tables at the casino
     * @notice The key is the table ID, and the value is the table struct
     */
    mapping(uint256 tableId => Table table) tables;

    /**
     * @dev The next withdrawal nonce for each player
     * @notice This mapping stores the next withdrawal nonce for each player
     * @notice The key is the player address, and the value is the next withdrawal nonce
     */
    mapping(address player => uint256 nonce) public nextWithdrawalNonce;

    ///////////////////////////////////////////////////////////////////////////
    // 5) Modifiers
    ///////////////////////////////////////////////////////////////////////////

    /**
     * @dev Throws if called by any account other than the house
     */
    modifier onlyHouse() {
        require(msg.sender == house, UnauthorizedHouse(msg.sender));
        _;
    }

    ///////////////////////////////////////////////////////////////////////////
    // 6) Constructor and Initializer
    ///////////////////////////////////////////////////////////////////////////

    /**
     * @dev Constructor that disables initialization on the implementation contract
     *
     * This prevents the implementation contract from being initialized directly.
     * Only proxy contracts should be initialized via the `initialize` function.
     *
     * @custom:oz-upgrades-unsafe-allow constructor
     */
    constructor() {
        // Disable initialization on implementation contract
        _disableInitializers();
    }

    /**
     * @dev Initializes the contract
     *
     * This function replaces the constructor for upgradeable contracts.
     * It can only be called once, when the proxy is first deployed.
     *
     * @param initialOwner The address that will own the contract and have upgrade rights
     * @param house_ The public address of the TEE authorizer
     *
     * Requirements:
     * - `initialOwner` must not be the zero address
     * - `house_` must not be the zero address
     * - Can only be called once (enforced by `initializer` modifier)
     */
    function initialize(address initialOwner, address house_) public initializer {
        __Ownable_init(initialOwner);
        require(house_ != address(0), InvalidHouseAddress(address(0)));
        house = house_;
        emit CloutCardsInitialized(initialOwner, house_);
    }

    ///////////////////////////////////////////////////////////////////////////
    // 7) External/Public Functions
    ///////////////////////////////////////////////////////////////////////////

    /**
     * @dev Creates a new table
     *
     * Allows the house to create a new table with specified configuration.
     * The table is initialized as active and ready for players to join.
     *
     * @param tableId The unique identifier for the table
     * @param maxSeats The maximum number of seats at the table (1-8)
     * @param minimumBuyIn The minimum buy-in amount for the table (in wei)
     * @param maximumBuyIn The maximum buy-in amount for the table (in wei)
     * @param smallBlind The small blind amount for the table (in wei)
     * @param bigBlind The big blind amount for the table (in wei)
     * @param perHandRake The rake percentage for each hand (0-10000, where 10000 = 100%)
     *
     * Requirements:
     * - Caller must be the house (enforced by `onlyHouse` modifier)
     * - `tableId` must not already exist
     * - `maxSeats` must be between 1 and 8
     * - `minimumBuyIn` must be greater than zero
     * - `minimumBuyIn` must be less than or equal to `maximumBuyIn`
     * - `smallBlind` must be greater than zero
     * - `smallBlind` must be less than or equal to `bigBlind`
     * - `bigBlind` must be less than or equal to `maximumBuyIn`
     * - `perHandRake` must be between 0 and 10000
     *
     * Emits a {TableCreated} event.
     */
    function createTable(
        uint256 tableId,
        uint8 maxSeats,
        uint256 minimumBuyIn,
        uint256 maximumBuyIn,
        uint256 smallBlind,
        uint256 bigBlind,
        uint16 perHandRake
    ) public onlyHouse {
        require(maxSeats >= 1 && maxSeats <= 8, InvalidMaxSeats(maxSeats));
        require(minimumBuyIn > 0, InvalidMinimumBuyIn(minimumBuyIn));
        require(minimumBuyIn <= maximumBuyIn, InvalidBuyInRange(minimumBuyIn, maximumBuyIn));
        require(smallBlind > 0, InvalidSmallBlind(smallBlind));
        require(smallBlind <= bigBlind, InvalidBlindRange(smallBlind, bigBlind));
        require(bigBlind <= maximumBuyIn, BigBlindExceedsMaxBuyIn(bigBlind, maximumBuyIn));
        require(perHandRake <= 10000, InvalidRakePercentage(perHandRake));
        require(!tables[tableId].isActive, TableAlreadyExists(tableId));

        Table storage table = tables[tableId];
        table.isActive = true;
        table.maxSeats = maxSeats;
        table.minimumBuyIn = minimumBuyIn;
        table.maximumBuyIn = maximumBuyIn;
        table.smallBlind = smallBlind;
        table.bigBlind = bigBlind;
        table.perHandRake = perHandRake;

        emit TableCreated(tableId, maxSeats, minimumBuyIn, maximumBuyIn, smallBlind, bigBlind, perHandRake);
    }

    /**
     * @dev Updates the house address
     *
     * Allows the owner to change the TEE authorizer address. This is useful
     * if the TEE needs to be replaced or upgraded.
     *
     * @param newHouse The new house address
     *
     * Requirements:
     * - Caller must be the owner (enforced by `onlyOwner` modifier)
     * - `newHouse` must not be the zero address
     *
     * Emits a {HouseUpdated} event.
     */
    function setHouse(address newHouse) public onlyOwner {
        require(newHouse != address(0), InvalidHouseAddress(address(0)));
        address oldHouse = house;
        house = newHouse;
        emit HouseUpdated(oldHouse, newHouse, msg.sender);
    }

    /**
     * @dev Computes the digest for a sit signature
     *
     * This function allows external sources (frontends, RPC clients) to compute
     * the exact digest that will be used for signature verification. This enables
     * clients to craft the signature off-chain and verify it matches before submitting.
     *
     * The function reads the current seat occupant from storage, so the digest
     * reflects the actual state of the seat at the time of computation.
     *
     * @param tableId The unique identifier for the table
     * @param seatIndex The seat number (1-8) the player wants to sit at
     * @param player The address of the player who will sit
     * @param expiry The timestamp when the signature expires
     *
     * @return The keccak256 digest that should be signed by the house
     *
     * @notice The digest includes chainid and contract address to prevent replay attacks
     *         across different chains or contract deployments
     * @notice The digest uses the current seat occupant from storage (address(0) if empty)
     */
    function computeSitDigest(
        uint256 tableId,
        uint8 seatIndex,
        address player,
        uint256 expiry
    ) public view returns (bytes32) {
        address prevPlayer = tables[tableId].seats[seatIndex];
        return keccak256(
            abi.encode(
                "CloutCardsSit",
                block.chainid,
                address(this),
                tableId,
                seatIndex,
                player,
                prevPlayer,
                expiry
            )
        );
    }

    /**
     * @dev Allows a player to sit at a table seat
     *
     * This function enables a player to claim a seat at a table. The player must provide
     * a valid signature from the house (TEE) authorizing the sit action. The signature
     * includes protection against replay attacks (chainid, contract address, expiry)
     * and prevents race conditions (prevPlayer check).
     *
     * Presumably, the TEE will only provide the signature if a user can sit there,
     * even if the onchain contract thinks the seat is taken. The TEE knows if that player
     * has stood up and left the table, so semantically the user can use the signature to
     * "punch out" the existing player - because the TEE knows the seat is empty.
     *
     * The player must send ETH with the transaction equal to their buy-in amount.
     * The buy-in amount must be within the table's minimumBuyIn and maximumBuyIn range.
     *
     * @param tableId The unique identifier for the table
     * @param seatIndex The seat number (1-8) the player wants to sit at
     * @param prevPlayer The address of the player currently in the seat (or address(0) if empty)
     * @param expiry The timestamp when the signature expires
     * @param v The recovery byte of the signature
     * @param r The r component of the signature
     * @param s The s component of the signature
     *
     * Requirements:
     * - Signature must not be expired (block.timestamp <= expiry)
     * - Signature must be valid and signed by the house
     * - The seat must match the expected previous player (prevPlayer check prevents race conditions)
     * - Table must exist and be active
     * - msg.value must be >= table.minimumBuyIn and <= table.maximumBuyIn
     *
     * Errors:
     * - {SitSignatureExpired} - If the signature has expired
     * - {InvalidSitSignature} - If the signature is invalid or not signed by house
     * - {SeatChanged} - If the seat has changed since the signature was created
     * - {InvalidBuyInAmount} - If the provided ETH amount is not within the table's buy-in range
     *
     * Side effects:
     * - Updates the seat mapping to assign the seat to msg.sender
     * - Accepts ETH payment (via payable modifier) as the player's buy-in
     * - The ETH is held by the contract and represents the player's chip stack
     *
     * @notice Players can call computeSitDigest() via RPC to get the digest before signing
     * @notice The prevPlayer check ensures atomic seat assignment and prevents double-sitting
     * @notice computeSitDigest() reads prevPlayer from storage automatically, but sit() still
     *         requires it as a parameter to verify the seat hasn't changed between digest computation and execution
     */
    function sit(
        uint256 tableId,
        uint8 seatIndex,
        address prevPlayer,
        uint256 expiry,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable {
        Table storage t = tables[tableId];
        require(block.timestamp <= expiry, SitSignatureExpired(expiry, block.timestamp));

        require(
            msg.value >= t.minimumBuyIn && msg.value <= t.maximumBuyIn,
            InvalidBuyInAmount(msg.value, t.minimumBuyIn, t.maximumBuyIn)
        );

        bytes32 digest = computeSitDigest(tableId, seatIndex, msg.sender, expiry);

        address recovered = ecrecover(digest, v, r, s);
        require(recovered == house, InvalidSitSignature(recovered, house));

        require(t.seats[seatIndex] == prevPlayer, SeatChanged(seatIndex, prevPlayer, t.seats[seatIndex]));
        t.seats[seatIndex] = msg.sender;
    }

    ///////////////////////////////////////////////////////////////////////////
    // 8) Internal/Private Functions
    ///////////////////////////////////////////////////////////////////////////

    /**
     * @dev Authorizes an upgrade to a new implementation
     *
     * This function is called by `upgradeToAndCall` to check if the caller
     * is authorized to perform the upgrade. Only the owner can authorize upgrades.
     *
     * @param newImplementation The address of the new implementation contract
     *
     * Requirements:
     * - Caller must be the owner (enforced by `onlyOwner` modifier)
     * - `newImplementation` must be a valid contract address
     *
     * @custom:oz-upgrades-unsafe-allow-reachable delegatecall
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner view {
        // Additional validation can be added here if needed
        // For example, checking that newImplementation is a contract
        require(newImplementation != address(0), "CloutCards: invalid implementation");
    }
}
