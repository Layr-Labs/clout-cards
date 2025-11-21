// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

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
 * - EIP712Upgradeable: For EIP-712 compliant typed data signing
 *
 * @custom:security-contact security@cloutcards.io
 */
contract CloutCards is Initializable, UUPSUpgradeable, OwnableUpgradeable, EIP712Upgradeable {
    
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
     * @dev The seat index is out of range (must be between 0 and table.maxSeats - 1)
     */
    error InvalidSeatIndex(uint8 seatIndex, uint8 maxSeats);

    /**
     * @dev The seat has changed since the signature was created
     */
    error SeatChanged(uint8 seatIndex, address expectedPlayer, address currentPlayer);

    /**
     * @dev The buy-in amount is invalid (must be between minimumBuyIn and maximumBuyIn)
     */
    error InvalidBuyInAmount(uint256 providedAmount, uint256 minimumBuyIn, uint256 maximumBuyIn);

    /**
     * @dev The table is not active
     */
    error TableNotActive(uint256 tableId);

    /**
     * @dev The rake percentage is invalid (must be between 0 and 10000)
     */
    error InvalidRakePercentage(uint16 perHandRake);

    /**
     * @dev The table already exists
     */
    error TableAlreadyExists(uint256 tableId);

    /**
     * @dev The table does not exist
     */
    error TableDoesNotExist(uint256 tableId);

    /**
     * @dev The implementation address is invalid (zero address)
     */
    error InvalidImplementation(address implementation);

    /**
     * @dev The small blind is zero or invalid
     */
    error InvalidSmallBlind(uint256 smallBlind);

    /**
     * @dev The blind range is invalid (small blind must be <= big blind)
     */
    error InvalidBlindRange(uint256 smallBlind, uint256 bigBlind);

        /**
     * @dev The caller is not the current owner of the seat
     */
    error NotSeatOwner(uint256 tableId, uint8 seatIndex, address caller, address seatOwner);

    /**
     * @dev The player is already seated at a table
     */
    error PlayerAlreadySeated(address player);

    /**
     * @dev The player is not seated at any table
     */
    error PlayerNotSeated(address player);

    /**
     * @dev The player is still seated and cannot withdraw
     */
    error PlayerStillSeated(address player);

    /**
     * @dev The withdrawal signature has expired
     */
    error WithdrawalSignatureExpired(uint256 expiry, uint256 currentTimestamp);

    /**
     * @dev The withdrawal signature is invalid (not signed by house)
     */
    error InvalidWithdrawalSignature(address recovered, address house);

    /**
     * @dev The withdrawal nonce is invalid
     */
    error InvalidWithdrawalNonce(address player, uint256 expectedNonce, uint256 providedNonce);

    /**
     * @dev The withdrawal amount is invalid (must be > 0)
     */
    error InvalidWithdrawalAmount(uint256 amount);

    /**
     * @dev The withdrawal recipient address is invalid (zero address)
     */
    error InvalidWithdrawalRecipient(address to);

    /**
     * @dev ETH transfer failed
     */
    error ETHTransferFailed(address to, uint256 amount);

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

    /**
     * @dev Emitted when a table's active state is changed
     * @param tableId The unique identifier for the table
     * @param previousState The previous active state of the table
     * @param newState The new active state of the table
     * @param house The address of the house that changed the state
     */
    event TableStateChanged(
        uint256 indexed tableId,
        bool previousState,
        bool newState,
        address indexed house
    );

    /**
     * @dev Emitted when a player sits at a table
     * @param tableId The unique identifier for the table
     * @param seatIndex The seat index the player sat at (0 to maxSeats-1)
     * @param player The address of the player who sat down
     * @param prevPlayer The address of the previous player in the seat (address(0) if empty)
     * @param amount The buy-in amount (in wei) the player deposited
     */
    event PlayerSat(
        uint256 indexed tableId,
        uint8 indexed seatIndex,
        address indexed player,
        address prevPlayer,
        uint256 amount
    );

    /**
     * @dev Emitted when a player stands up from a table seat
     * @param tableId The unique identifier for the table
     * @param seatIndex The seat index the player stood up from
     * @param player The address of the player who stood up
     * @param timestamp The block timestamp when the player stood up
     */
    event PlayerStood(
        uint256 indexed tableId,
        uint8 indexed seatIndex,
        address indexed player,
        uint256 timestamp
    );

    /**
     * @dev Emitted when a withdrawal is executed
     * @param player The logical player identity whose escrow is being withdrawn
     * @param to The recipient address of the withdrawal
     * @param amount The amount of ETH withdrawn (in wei)
     * @param nonce The withdrawal nonce used
     */
    event WithdrawalExecuted(
        address indexed player,
        address indexed to,
        uint256 amount,
        uint256 nonce
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
        mapping(uint8 seatNumber => address seatOwner) seats; // The seats at the table (0-indexed, 0 to maxSeats-1)
    }

    ///////////////////////////////////////////////////////////////////////////
    // 4) Storage Variables
    ///////////////////////////////////////////////////////////////////////////

    /**
     * @dev The typehash for the Sit struct used in EIP-712 signing
     * @notice This must match the struct definition: Sit(uint256 tableId,uint8 seatIndex,address player,address prevPlayer,uint256 expiry)
     */
    bytes32 private constant SIT_TYPEHASH =
        keccak256("Sit(uint256 tableId,uint8 seatIndex,address player,address prevPlayer,uint256 expiry)");

     /**
     * @dev The typehash for the Withdraw struct used in EIP-712 signing
     * @notice Must match: Withdraw(address player,address to,uint256 amount,uint256 nonce,uint256 expiry)
     */
    bytes32 private constant WITHDRAW_TYPEHASH =
        keccak256("Withdraw(address player,address to,uint256 amount,uint256 nonce,uint256 expiry)");
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
    mapping(uint256 tableId => Table table) public tables;


    /**
     * @dev A Global mapping to track if a player is seated at any table
     * @notice The key is the player address, and the value is a boolean indicating if the player is seated
     */
    mapping(address player => bool isSeated) public isSeated;

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
        if (msg.sender != house) revert UnauthorizedHouse(msg.sender);
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
     *
     * @notice The EIP-712 domain is initialized with name "CloutCards" and version "1".
     *         The chain ID is automatically included from `block.chainid` by the EIP712Upgradeable contract,
     *         so signatures are automatically chain-specific and prevent cross-chain replay attacks.
     * @notice UUPSUpgradeable does not require initialization as it is stateless.
     */
    function initialize(address initialOwner, address house_) public initializer {
        __Ownable_init(initialOwner);
        __EIP712_init("CloutCards", "1");
        if (house_ == address(0)) revert InvalidHouseAddress(address(0));
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
        if (maxSeats < 1 || maxSeats > 8) revert InvalidMaxSeats(maxSeats);
        if (minimumBuyIn == 0) revert InvalidMinimumBuyIn(minimumBuyIn);
        if (minimumBuyIn > maximumBuyIn) revert InvalidBuyInRange(minimumBuyIn, maximumBuyIn);
        if (smallBlind == 0) revert InvalidSmallBlind(smallBlind);
        if (smallBlind > bigBlind) revert InvalidBlindRange(smallBlind, bigBlind);
        if (bigBlind > maximumBuyIn) revert BigBlindExceedsMaxBuyIn(bigBlind, maximumBuyIn);
        if (perHandRake > 10000) revert InvalidRakePercentage(perHandRake);
        if (tables[tableId].maxSeats != 0) revert TableAlreadyExists(tableId);

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
        if (newHouse == address(0)) revert InvalidHouseAddress(address(0));
        address oldHouse = house;
        house = newHouse;
        emit HouseUpdated(oldHouse, newHouse, msg.sender);
    }

    /**
     * @dev Sets the active state of a table
     *
     * Allows the house to activate or deactivate a table. When active, players can sit at the table.
     * When inactive, new players cannot sit, but existing players remain seated.
     *
     * @param tableId The unique identifier for the table
     * @param isActive The desired active state (true to activate, false to deactivate)
     *
     * Requirements:
     * - Caller must be the house (enforced by `onlyHouse` modifier)
     * - Table must exist (created via `createTable`)
     *
     * Errors:
     * - {TableDoesNotExist} - If the table does not exist (maxSeats is zero)
     *
     * Emits a {TableStateChanged} event with the previous and new state.
     */
    function setTableState(uint256 tableId, bool isActive) public onlyHouse {
        Table storage t = tables[tableId];
        if (t.maxSeats == 0) revert TableDoesNotExist(tableId);
        bool previousState = t.isActive;
        t.isActive = isActive;
        emit TableStateChanged(tableId, previousState, isActive, msg.sender);
    }

    /**
     * @dev Computes the EIP-712 digest for a sit signature
     *
     * This function allows external sources (frontends, RPC clients) to compute
     * the exact digest that will be used for signature verification. This enables
     * clients to craft the signature off-chain and verify it matches before submitting.
     *
     * The function reads the current seat occupant from storage, so the digest
     * reflects the actual state of the seat at the time of computation.
     *
     * @param tableId The unique identifier for the table
     * @param seatIndex The seat index (0 to maxSeats-1) the player wants to sit at
     * @param player The address of the player who will sit
     * @param expiry The timestamp when the signature expires
     *
     * @return The EIP-712 typed data digest that should be signed by the house
     *
     * @notice The digest uses EIP-712 domain separator which includes chainid and contract address
     *         to prevent replay attacks across different chains or contract deployments
     * @notice The digest uses the current seat occupant from storage (address(0) if empty)
     * @notice This function is EIP-712 compliant and can be used with eth_signTypedDataV4
     *
     * Requirements:
     * - Table must exist (created via `createTable`) - validated via `_validateTableAndSeat()`
     * - Table must be active - validated via `_validateTableAndSeat()`
     * - seatIndex must be between 0 and table.maxSeats - 1 (inclusive) - validated via `_validateTableAndSeat()`
     *
     * Errors:
     * - {TableDoesNotExist} - If the table does not exist (maxSeats is zero)
     * - {TableNotActive} - If the table is not active
     * - {InvalidSeatIndex} - If the seatIndex is out of range
     */
    function computeSitDigest(
        uint256 tableId,
        uint8 seatIndex,
        address player,
        uint256 expiry
    ) public view returns (bytes32) {
        _validateTableAndSeat(tableId, seatIndex, false);
        address prevPlayer = tables[tableId].seats[seatIndex];
        return _computeSitDigest(tableId, seatIndex, player, prevPlayer, expiry);
    }

    /**
     * @dev Computes the EIP-712 digest for a withdrawal signature
     *
     * This function allows external sources (frontends, RPC clients) to compute
     * the exact digest that will be used for signature verification. This enables
     * clients to craft the signature off-chain and verify it matches before submitting.
     *
     * The digest includes protection against replay attacks through:
     * - Chain ID (via EIP-712 domain separator)
     * - Contract address (via EIP-712 domain separator)
     * - Expiry timestamp
     * - Nonce (prevents reuse of the same signature)
     *
     * @param player The logical player identity whose escrow is being withdrawn
     * @param to The recipient address that will receive the withdrawn funds
     * @param amount The amount of ETH to withdraw (in wei)
     * @param nonce The withdrawal nonce to prevent replay attacks
     * @param expiry The timestamp when the signature expires
     *
     * @return The EIP-712 typed data digest that should be signed by the house
     *
     * @notice The digest uses EIP-712 domain separator which includes chainid and contract address
     *         to prevent replay attacks across different chains or contract deployments
     * @notice The nonce ensures that each withdrawal signature can only be used once
     * @notice This function is EIP-712 compliant and can be used with eth_signTypedDataV4
     */
    function computeWithdrawDigest(
        address player,
        address to,
        uint256 amount,
        uint256 nonce,
        uint256 expiry
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                WITHDRAW_TYPEHASH,
                player,
                to,
                amount,
                nonce,
                expiry
            )
        );
        return _hashTypedDataV4(structHash);
    }

    /**
     * @dev Allows a player to sit at a table seat
     *
     * This function enables a player to claim a seat at a table. The player must provide
     * a valid EIP-712 signature from the house (TEE) authorizing the sit action. The signature
     * includes protection against replay attacks (chainid, contract address via EIP-712 domain separator, expiry)
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
     * @param seatIndex The seat index (0 to maxSeats-1) the player wants to sit at
     * @param prevPlayer The address of the player currently in the seat (or address(0) if empty)
     * @param expiry The timestamp when the signature expires
     * @param v The recovery byte of the signature
     * @param r The r component of the signature
     * @param s The s component of the signature
     *
     * Requirements:
     * - Table must exist (created via `createTable`) - validated via `_validateTableAndSeat()`
     * - Table must be active - validated via `_validateTableAndSeat()`
     * - seatIndex must be between 0 and table.maxSeats - 1 (inclusive) - validated via `_validateTableAndSeat()`
     * - Player must not already be seated at any table
     * - Signature must not be expired (block.timestamp <= expiry)
     * - Signature must be valid and signed by the house
     * - The seat must match the expected previous player (prevPlayer check prevents race conditions)
     * - msg.value must be >= table.minimumBuyIn and <= table.maximumBuyIn
     *
     * Errors:
     * - {TableDoesNotExist} - If the table does not exist (maxSeats is zero)
     * - {TableNotActive} - If the table is not active
     * - {InvalidSeatIndex} - If the seatIndex is out of range
     * - {PlayerAlreadySeated} - If the player is already seated at another table
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
     * Emits a {PlayerSat} event.
     *
     * @notice Players can call computeSitDigest() via RPC to get the EIP-712 digest before signing
     * @notice The prevPlayer parameter is used to compute the digest for signature verification.
     *         This ensures the signature was created with the expected seat state.
     * @notice The prevPlayer check after signature verification ensures atomic seat assignment
     *         and prevents double-sitting by verifying the seat hasn't changed since the signature was created
     * @notice This function uses EIP-712 compliant signature verification via ECDSA.recover
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
        _validateTableAndSeat(tableId, seatIndex, false);
        if (isSeated[msg.sender]) revert PlayerAlreadySeated(msg.sender);
        if (block.timestamp > expiry) revert SitSignatureExpired(expiry, block.timestamp);

        if (msg.value < t.minimumBuyIn || msg.value > t.maximumBuyIn) {
            revert InvalidBuyInAmount(msg.value, t.minimumBuyIn, t.maximumBuyIn);
        }

        bytes32 digest = _computeSitDigest(tableId, seatIndex, msg.sender, prevPlayer, expiry);

        address recovered = ECDSA.recover(digest, v, r, s);
        if (recovered != house) revert InvalidSitSignature(recovered, house);

        if (t.seats[seatIndex] != prevPlayer) {
            revert SeatChanged(seatIndex, prevPlayer, t.seats[seatIndex]);
        }
        
        // Punch out previous player if they exist
        if (prevPlayer != address(0)) {
            isSeated[prevPlayer] = false;
        }
        
        t.seats[seatIndex] = msg.sender;
        isSeated[msg.sender] = true;
        emit PlayerSat(tableId, seatIndex, msg.sender, prevPlayer, msg.value);
    }

    /**
     * @dev Stands up from a seat and executes a TEE-authorized withdrawal in a single transaction.
     *
     * This is the "happy path" UX: the player clicks "Stand / Cash Out" and:
     * - Their seat is cleared on-chain.
     * - Their escrow balance (as determined by the TEE) is withdrawn to `to`.
     *
     * The TEE signs a typed Withdraw struct:
     *   Withdraw(address player,address to,uint256 amount,uint256 nonce,uint256 expiry)
     *
     * For this function, `player` is implicitly `msg.sender`.
     *
     * @param tableId   The unique identifier for the table.
     * @param seatIndex The seat index (0 to maxSeats-1) the caller is standing from.
     * @param to        The recipient address of the withdrawn ETH (often msg.sender).
     * @param amount    The amount of ETH to withdraw (in wei).
     * @param nonce     The withdrawal nonce, must equal nextWithdrawalNonce[msg.sender].
     * @param expiry    The timestamp when the signature expires.
     * @param v         The recovery byte of the ECDSA signature.
     * @param r         The r component of the ECDSA signature.
     * @param s         The s component of the ECDSA signature.
     *
     * Requirements:
     * - Table must exist and seatIndex must be in range (validated via _validateTableAndSeat).
     *   Table may be inactive (players can stand/withdraw from inactive tables).
     * - The caller must be seated at a table, otherwise {PlayerNotSeated}.
     * - The caller must be the current owner of (tableId, seatIndex),
     *   otherwise {NotSeatOwner}.
     * - block.timestamp <= expiry, otherwise {WithdrawalSignatureExpired}.
     * - amount > 0, otherwise {InvalidWithdrawalAmount}.
     * - to != address(0), otherwise {InvalidWithdrawalRecipient}.
     * - nonce == nextWithdrawalNonce[msg.sender], otherwise {InvalidWithdrawalNonce}.
     * - Signature must be valid and signed by `house`, otherwise {InvalidWithdrawalSignature}.
     *
     * Effects:
     * - Clears the seat (sets seats[seatIndex] = address(0)).
     * - Clears the player's seated flag (sets isSeated[msg.sender] = false).
     * - Increments nextWithdrawalNonce[msg.sender].
     * - Transfers `amount` ETH to `to`.
     *
     * Errors:
     * - {TableDoesNotExist} - If the table does not exist
     * - {InvalidSeatIndex} - If the seatIndex is out of range
     * - {PlayerNotSeated} - If the caller is not seated at any table
     * - {NotSeatOwner} - If the caller is not the current seat owner
     * - {WithdrawalSignatureExpired} - If the signature has expired
     * - {InvalidWithdrawalAmount} - If the withdrawal amount is zero
     * - {InvalidWithdrawalRecipient} - If the recipient address is zero
     * - {InvalidWithdrawalNonce} - If the nonce doesn't match the expected value
     * - {InvalidWithdrawalSignature} - If the signature is invalid or not signed by house
     * - {ETHTransferFailed} - If the ETH transfer fails
     *
     * Emits:
     * - {PlayerStood}.
     * - {WithdrawalExecuted}.
     */
    function standAndWithdrawal(
        uint256 tableId,
        uint8 seatIndex,
        address to,
        uint256 amount,
        uint256 nonce,
        uint256 expiry,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        _validateTableAndSeat(tableId, seatIndex, true);
        if (!isSeated[msg.sender]) revert PlayerNotSeated(msg.sender);

        Table storage t = tables[tableId];
        if (t.seats[seatIndex] != msg.sender) {
            revert NotSeatOwner(tableId, seatIndex, msg.sender, t.seats[seatIndex]);
        }

        if (block.timestamp > expiry) {
            revert WithdrawalSignatureExpired(expiry, block.timestamp);
        }
        if (amount == 0) {
            revert InvalidWithdrawalAmount(amount);
        }
        if (to == address(0)) {
            revert InvalidWithdrawalRecipient(to);
        }

        uint256 expectedNonce = nextWithdrawalNonce[msg.sender];
        if (nonce != expectedNonce) {
            revert InvalidWithdrawalNonce(msg.sender, expectedNonce, nonce);
        }

        // Canonical EIP-712 digest using msg.sender as player.
        bytes32 digest = computeWithdrawDigest(msg.sender, to, amount, nonce, expiry);

        address recovered = ECDSA.recover(digest, v, r, s);
        if (recovered != house) {
            revert InvalidWithdrawalSignature(recovered, house);
        }

        // --- Effects before interaction ---

        // 1) Clear seat and seated flag
        t.seats[seatIndex] = address(0);
        isSeated[msg.sender] = false;
        emit PlayerStood(tableId, seatIndex, msg.sender, block.timestamp);

        // 2) Bump nonce
        nextWithdrawalNonce[msg.sender] = expectedNonce + 1;

        // --- Interaction ---

        (bool success, ) = to.call{value: amount}("");
        if (!success) revert ETHTransferFailed(to, amount);

        emit WithdrawalExecuted(msg.sender, to, amount, nonce);
    }

    /**
     * @dev Executes a TEE-authorized withdrawal for a player's escrow balance
     *
     * This function allows a player (or authorized party) to withdraw escrow balance
     * that has been authorized by the house (TEE). Unlike `standAndWithdrawal()`,
     * this function does not require the player to be at a specific seat - it only
     * requires that the player is not currently seated at any table.
     *
     * The TEE signs a typed Withdraw struct:
     *   Withdraw(address player,address to,uint256 amount,uint256 nonce,uint256 expiry)
     *
     * This function allows withdrawals to be executed by anyone (not just the player),
     * as long as they have a valid signature from the house. This enables use cases
     * like relayer services or batch withdrawals.
     *
     * @param player The logical player identity whose escrow is being withdrawn
     * @param to The recipient address that will receive the withdrawn funds
     * @param amount The amount of ETH to withdraw (in wei)
     * @param nonce The withdrawal nonce, must equal nextWithdrawalNonce[player]
     * @param expiry The timestamp when the signature expires
     * @param v The recovery byte of the ECDSA signature
     * @param r The r component of the ECDSA signature
     * @param s The s component of the ECDSA signature
     *
     * Requirements:
     * - `player` must not be seated at any table (critical invariant)
     * - block.timestamp <= expiry
     * - amount > 0
     * - to != address(0)
     * - nonce == nextWithdrawalNonce[player]
     * - Signature must be valid and signed by `house`
     *
     * Effects:
     * - Increments nextWithdrawalNonce[player]
     * - Transfers `amount` ETH to `to`
     *
     * Errors:
     * - {PlayerStillSeated} - If the player is currently seated at a table
     * - {WithdrawalSignatureExpired} - If the signature has expired
     * - {InvalidWithdrawalAmount} - If the withdrawal amount is zero
     * - {InvalidWithdrawalRecipient} - If the recipient address is zero
     * - {InvalidWithdrawalNonce} - If the nonce doesn't match the expected value
     * - {InvalidWithdrawalSignature} - If the signature is invalid or not signed by house
     * - {ETHTransferFailed} - If the ETH transfer fails
     *
     * Emits:
     * - {WithdrawalExecuted}
     *
     * @notice This function enforces a critical invariant: players cannot withdraw
     *         while seated. They must first stand up (via `standAndWithdrawal()` or
     *         a future `stand()` function) before withdrawing their escrow balance.
     * @notice The signature can be created off-chain using `computeWithdrawDigest()`
     *         via RPC to get the exact digest that will be used for verification.
     * @notice This function uses EIP-712 compliant signature verification via ECDSA.recover
     */
    function withdraw(
        address player,
        address to,
        uint256 amount,
        uint256 nonce,
        uint256 expiry,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        // Critical invariant: cannot withdraw while seated.
        if (isSeated[player]) {
            revert PlayerStillSeated(player);
        }

        if (block.timestamp > expiry) {
            revert WithdrawalSignatureExpired(expiry, block.timestamp);
        }
        if (amount == 0) {
            revert InvalidWithdrawalAmount(amount);
        }
        if (to == address(0)) {
            revert InvalidWithdrawalRecipient(to);
        }

        uint256 expectedNonce = nextWithdrawalNonce[player];
        if (nonce != expectedNonce) {
            revert InvalidWithdrawalNonce(player, expectedNonce, nonce);
        }

        bytes32 digest = computeWithdrawDigest(player, to, amount, nonce, expiry);
        address recovered = ECDSA.recover(digest, v, r, s);
        if (recovered != house) {
            revert InvalidWithdrawalSignature(recovered, house);
        }

        nextWithdrawalNonce[player] = expectedNonce + 1;

        (bool success, ) = to.call{value: amount}("");
        if (!success) revert ETHTransferFailed(to, amount);

        emit WithdrawalExecuted(player, to, amount, nonce);
    }

    ///////////////////////////////////////////////////////////////////////////
    // 8) Internal/Private Functions
    ///////////////////////////////////////////////////////////////////////////

    /**
     * @dev Computes the EIP-712 digest for a sit signature with a specific prevPlayer
     *
     * This internal function computes the digest using the provided prevPlayer value.
     * It is used by both `computeSitDigest()` (which reads prevPlayer from storage)
     * and `sit()` (which uses the prevPlayer parameter for signature verification).
     *
     * @param tableId The unique identifier for the table
     * @param seatIndex The seat index (0 to maxSeats-1)
     * @param player The address of the player who will sit
     * @param prevPlayer The address of the previous player in the seat (or address(0) if empty)
     * @param expiry The timestamp when the signature expires
     *
     * @return The EIP-712 typed data digest
     */
    function _computeSitDigest(
        uint256 tableId,
        uint8 seatIndex,
        address player,
        address prevPlayer,
        uint256 expiry
    ) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                SIT_TYPEHASH,
                tableId,
                seatIndex,
                player,
                prevPlayer,
                expiry
            )
        );
        return _hashTypedDataV4(structHash);
    }

    /**
     * @dev Validates that a table exists and optionally checks if it's active, and that the seat index is valid
     *
     * This internal function centralizes table validation logic used by
     * `computeSitDigest()`, `sit()`, and `standAndWithdrawal()` functions.
     *
     * @param tableId The unique identifier for the table
     * @param seatIndex The seat index to validate
     * @param allowInactive If true, allows operations on inactive tables (e.g., standing/withdrawing).
     *                      If false, requires the table to be active (e.g., sitting).
     *
     * Errors:
     * - {TableDoesNotExist} - If the table does not exist (maxSeats is zero)
     * - {TableNotActive} - If the table is not active and allowInactive is false
     * - {InvalidSeatIndex} - If the seatIndex is out of range
     */
    function _validateTableAndSeat(uint256 tableId, uint8 seatIndex, bool allowInactive) internal view {
        Table storage t = tables[tableId];
        if (t.maxSeats == 0) revert TableDoesNotExist(tableId);
        if (!allowInactive && !t.isActive) revert TableNotActive(tableId);
        if (seatIndex >= t.maxSeats) revert InvalidSeatIndex(seatIndex, t.maxSeats);
    }

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
     * Errors:
     * - {InvalidImplementation} - If the newImplementation is the zero address
     *
     * @custom:oz-upgrades-unsafe-allow-reachable delegatecall
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner view {
        // Additional validation can be added here if needed
        // For example, checking that newImplementation is a contract
        if (newImplementation == address(0)) revert InvalidImplementation(address(0));
    }
}
