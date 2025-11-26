// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title DeployProxy
 * @dev This script exists solely to ensure ERC1967Proxy is compiled by Foundry
 * 
 * The TypeScript deployment script needs the ERC1967Proxy artifact.
 * By importing it here, Foundry will compile it and generate the artifact.
 */
contract DeployProxy {
    // This contract is never deployed - it's just here to trigger compilation
    // of ERC1967Proxy so we can use its artifact in the TypeScript script
}

