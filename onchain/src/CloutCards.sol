// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title CloutCards
 * @dev UUPS upgradeable escrow contract for the Clout Cards application
 *
 * This contract implements a simple escrow system where players can deposit ETH
 * and withdraw it with authorization from the house (TEE). The contract uses
 * EIP-712 signatures for secure withdrawal authorization.
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
     * @dev The implementation address is invalid (zero address)
     */
    error InvalidImplementation(address implementation);

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
     * @dev The deposit amount is zero
     */
    error ZeroDeposit();

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
     * @dev Emitted when ETH is deposited into escrow
     * @param player The logical player address whose balance is credited
     * @param depositor The address that sent the ETH (may differ from player for depositFor)
     * @param amount The amount of ETH deposited (in wei)
     */
    event Deposited(address indexed player, address indexed depositor, uint256 amount);

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
    // 4) Storage Variables
    ///////////////////////////////////////////////////////////////////////////

     /**
     * @dev The typehash for the Withdraw struct used in EIP-712 signing
     * @notice Must match: Withdraw(address player,address to,uint256 amount,uint256 nonce,uint256 expiry)
     */
    bytes32 public constant WITHDRAW_TYPEHASH =
        keccak256("Withdraw(address player,address to,uint256 amount,uint256 nonce,uint256 expiry)");
    /**
     * @dev The public address of the TEE (Trusted Execution Environment) authorizer
     * @notice This address represents the "house" that authorizes certain operations
     */
    address public house;

    /**
     * @dev The escrow balance for each player
     * @notice This mapping stores the ETH balance held in escrow for each player
     * @notice The key is the player address, and the value is the balance in wei
     */
    mapping(address player => uint256 balance) public balances;

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

    ///////////////////////////////////////////////////////////////////////////
    // 8) Deposits
    ///////////////////////////////////////////////////////////////////////////

    /**
     * @dev Deposit ETH on behalf of a given player.
     *
     * Useful if you ever want to support:
     * - custodial deposits,
     * - tipping others,
     * - a relayer that deposits for a player.
     *
     * @param player The logical player address whose balance will be credited.
     *
     * Requirements:
     * - msg.value > 0
     * - player != address(0)
     *
     * Effects:
     * - Credits msg.value to balances[player]
     *
     * Errors:
     * - {ZeroDeposit} - If msg.value is zero
     * - {InvalidWithdrawalRecipient} - If player is the zero address
     *
     * Emits:
     * - {Deposited}
     */
    function depositFor(address player) external payable {
        if (player == address(0)) revert InvalidWithdrawalRecipient(player);
        _depositFor(player);
    }

    /**
     * @dev Receive hook: treat plain ETH sends as `deposit()` for msg.sender.
     *
     * This allows users to send ETH directly to the contract address,
     * and it will be automatically deposited to their balance.
     *
     * Requirements:
     * - msg.value > 0
     *
     * Effects:
     * - Credits msg.value to balances[msg.sender]
     *
     * Errors:
     * - {ZeroDeposit} - If msg.value is zero
     *
     * Emits:
     * - {Deposited}
     */
    receive() external payable {
        _depositFor(msg.sender);
    }

    ///////////////////////////////////////////////////////////////////////////
    // 9) Withdrawals
    ///////////////////////////////////////////////////////////////////////////

    /**
     * @dev Computes the EIP-712 digest for a withdrawal signature
     *
     * This function allows external sources (frontends, RPC clients) to compute
     * the exact digest that will be used for signature verification. This enables
     * clients to craft the signature off-chain and verify it matches before submitting.
     *
     * The function automatically reads the current withdrawal nonce from storage,
     * eliminating the need for external callers to query the nonce separately.
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
     * @param expiry The timestamp when the signature expires
     *
     * @return digest The EIP-712 typed data digest that should be signed by the house
     * @return nonce The withdrawal nonce that was used to compute the digest
     *
     * @notice The digest uses EIP-712 domain separator which includes chainid and contract address
     *         to prevent replay attacks across different chains or contract deployments
     * @notice The nonce is automatically read from nextWithdrawalNonce[player] storage and returned
     *         so callers can verify which nonce was used without making a separate query
     * @notice The nonce ensures that each withdrawal signature can only be used once
     * @notice This function is EIP-712 compliant and can be used with eth_signTypedDataV4
     */
    function computeWithdrawDigest(
        address player,
        address to,
        uint256 amount,
        uint256 expiry
    ) public view returns (bytes32, uint256) {
        uint256 nonce = nextWithdrawalNonce[player];
        return (_computeWithdrawDigest(player, to, amount, nonce, expiry), nonce);
    }

    /**
     * @dev Executes a TEE-authorized withdrawal for a player's escrow balance
     *
     * This function allows a player (or authorized party) to withdraw escrow balance
     * that has been authorized by the house (TEE). The house determines the withdrawal
     * amount based on the player's escrow balance and game state (managed off-chain).
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
     * - block.timestamp <= expiry
     * - amount > 0
     * - to != address(0)
     * - nonce == nextWithdrawalNonce[player]
     * - Signature must be valid and signed by `house`
     *
     * Effects:
     * - Increments nextWithdrawalNonce[player]
     * - Decrements balances[player] by amount (saturating at zero if TEE authorized more than on-chain balance)
     * - Transfers `amount` ETH to `to`
     *
     * Errors:
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

        bytes32 digest = _computeWithdrawDigest(player, to, amount, nonce, expiry);
        address recovered = ECDSA.recover(digest, v, r, s);
        if (recovered != house) {
            revert InvalidWithdrawalSignature(recovered, house);
        }

        nextWithdrawalNonce[player] = expectedNonce + 1;

        // Decrement on-chain balance for accurate accounting
        // Note: We don't enforce amount <= balances[player] because the TEE's signature
        // is the source of truth. The on-chain balance is primarily for tracking deposits
        // that occurred while the TEE was down. We use saturating subtraction to prevent
        // underflow - if TEE authorizes more than on-chain balance, set to zero.
        // The contract's ETH balance is the ultimate constraint, so this is safe.
        if (balances[player] >= amount) {
            balances[player] -= amount;
        } else {
            // TEE authorized more than on-chain balance - set to zero to prevent underflow
            balances[player] = 0;
        }

        (bool success, ) = to.call{value: amount}("");
        if (!success) revert ETHTransferFailed(to, amount);

        emit WithdrawalExecuted(player, to, amount, nonce);
    }

    ///////////////////////////////////////////////////////////////////////////
    // 10) Internal/Private Functions
    ///////////////////////////////////////////////////////////////////////////

    /**
     * @dev Computes the EIP-712 digest for a withdrawal signature with a specific nonce
     *
     * This internal function computes the digest using the provided nonce value.
     * It is used by both `computeWithdrawDigest()` (which reads nonce from storage)
     * and `withdraw()` (which uses the nonce parameter for signature verification).
     *
     * @param player The logical player identity whose escrow is being withdrawn
     * @param to The recipient address that will receive the withdrawn funds
     * @param amount The amount of ETH to withdraw (in wei)
     * @param nonce The withdrawal nonce to prevent replay attacks
     * @param expiry The timestamp when the signature expires
     *
     * @return The EIP-712 typed data digest
     */
    function _computeWithdrawDigest(
        address player,
        address to,
        uint256 amount,
        uint256 nonce,
        uint256 expiry
    ) internal view returns (bytes32) {
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
     * @dev Internal deposit helper.
     *
     * This function handles the common logic for all deposit operations.
     * It validates the deposit amount, updates the player's balance, and emits
     * the Deposited event.
     *
     * @param player The logical player address whose balance will be credited
     *
     * Requirements:
     * - msg.value > 0
     *
     * Effects:
     * - Increments balances[player] by msg.value
     *
     * Errors:
     * - {ZeroDeposit} - If msg.value is zero
     *
     * Emits:
     * - {Deposited}
     */
    function _depositFor(address player) internal {
        uint256 amount = msg.value;
        if (amount == 0) revert ZeroDeposit();

        balances[player] += amount;
        emit Deposited(player, msg.sender, amount);
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
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        // Additional validation can be added here if needed
        // For example, checking that newImplementation is a contract
        if (newImplementation == address(0)) revert InvalidImplementation(address(0));
    }
}
