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
     * @dev The rake percentage is invalid (must be between 0 and 10000)
     */
    error InvalidRakePercentage(uint16 perHandRake);

    /**
     * @dev The table already exists
     */
    error TableAlreadyExists(uint256 tableId);

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
     * @param perHandRake The rake percentage for each hand
     */
    event TableCreated(
        uint256 indexed tableId,
        uint8 maxSeats,
        uint256 minimumBuyIn,
        uint256 maximumBuyIn,
        uint16 perHandRake
    );

    ///////////////////////////////////////////////////////////////////////////
    // 3) Structs/Enums
    ///////////////////////////////////////////////////////////////////////////

    struct Table {
        uint256 minimumBuyIn;            // The minimum buy-in amount for the table (in wei)
        uint256 maximumBuyIn;            // The maximum buy-in amount for the table         
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
     * @param perHandRake The rake percentage for each hand (0-10000, where 10000 = 100%)
     *
     * Requirements:
     * - Caller must be the house (enforced by `onlyHouse` modifier)
     * - `tableId` must not already exist
     * - `maxSeats` must be between 1 and 8
     * - `minimumBuyIn` must be greater than zero
     * - `minimumBuyIn` must be less than or equal to `maximumBuyIn`
     * - `perHandRake` must be between 0 and 10000
     *
     * Emits a {TableCreated} event.
     */
    function createTable(
        uint256 tableId,
        uint8 maxSeats,
        uint256 minimumBuyIn,
        uint256 maximumBuyIn,
        uint16 perHandRake
    ) public onlyHouse {
        require(maxSeats >= 1 && maxSeats <= 8, InvalidMaxSeats(maxSeats));
        require(minimumBuyIn > 0, InvalidMinimumBuyIn(minimumBuyIn));
        require(minimumBuyIn <= maximumBuyIn, InvalidBuyInRange(minimumBuyIn, maximumBuyIn));
        require(perHandRake <= 10000, InvalidRakePercentage(perHandRake));
        require(!tables[tableId].isActive, TableAlreadyExists(tableId));

        Table storage table = tables[tableId];
        table.isActive = true;
        table.maxSeats = maxSeats;
        table.minimumBuyIn = minimumBuyIn;
        table.maximumBuyIn = maximumBuyIn;
        table.perHandRake = perHandRake;

        emit TableCreated(tableId, maxSeats, minimumBuyIn, maximumBuyIn, perHandRake);
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
