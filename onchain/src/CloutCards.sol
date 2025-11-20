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
    // Errors
    ///////////////////////////////////////////////////////////////////////////

    /**
     * @dev The house address is not a valid address (eg. `address(0)`)
     */
    error InvalidHouseAddress(address house);

    ///////////////////////////////////////////////////////////////////////////
    // Structs
    ///////////////////////////////////////////////////////////////////////////

    struct Table {
        uint8   maxSeats;                // The maximum number of seats at the table (1-8)
        uint256 minimumBuyIn;            // The minimum buy-in amount for the table (in wei)
        uint256 maximumBuyIn;            // The maximum buy-in amount for the table
        uint16  perHandRake;             // The rake percentage for each hand (0-10000)
        mapping(uint8 seatNumber => address seatOwner) seats; // The seats at the table (1-8)
    }

    ///////////////////////////////////////////////////////////////////////////
    // State Variables
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
    mapping(uint256 tableId => Table table) tables; // The tables at the casino

    ///////////////////////////////////////////////////////////////////////////
    // Events
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

    ///////////////////////////////////////////////////////////////////////////
    // Constructor
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
    // Functions
    ///////////////////////////////////////////////////////////////////////////

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

