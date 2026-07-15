// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract DevTrust {
    string public trustName;
    uint256 public creationTime;
    address public owner;
    address public oracle;
    
    struct TrustRecord {
        address user;
        string data;
        uint256 timestamp;
    }
    
    TrustRecord[] public records;
    
    mapping(address => uint256) public stakes;
    
    event RecordAdded(address indexed user, string data, uint256 timestamp);
    event OracleUpdated(address newOracle);
    event Staked(address indexed user, uint256 amount);
    event Slashed(address indexed developer, uint256 amount);
    event Rewarded(address indexed developer, uint256 amount);
    
    constructor(string memory _trustName) {
        trustName = _trustName;
        creationTime = block.timestamp;
        owner = msg.sender;
        oracle = msg.sender;
    }
    
    modifier onlyOwnerOrOracle() {
        require(msg.sender == owner || msg.sender == oracle, "Not authorized");
        _;
    }
    
    function setOracle(address _oracle) public {
        require(msg.sender == owner, "Only owner can set oracle");
        oracle = _oracle;
        emit OracleUpdated(_oracle);
    }
    
    function addRecord(address _user, string memory _data) public onlyOwnerOrOracle {
        records.push(TrustRecord({
            user: _user,
            data: _data,
            timestamp: block.timestamp
        }));
        
        emit RecordAdded(_user, _data, block.timestamp);
    }
    
    function getRecord(uint256 index) public view returns (address user, string memory data, uint256 timestamp) {
        require(index < records.length, "Invalid index");
        TrustRecord storage record = records[index];
        return (record.user, record.data, record.timestamp);
    }
    
    function getTotalRecords() public view returns (uint256) {
        return records.length;
    }
    
    function getTrustInfo() public view returns (string memory, uint256) {
        return (trustName, creationTime);
    }
    
    function stake() public payable {
        require(msg.value > 0, "Stake must be greater than 0");
        stakes[msg.sender] += msg.value;
        emit Staked(msg.sender, msg.value);
    }
    
    function isStaked(address user) public view returns (bool) {
        return stakes[user] > 0;
    }
    
    function slash(address developer) public onlyOwnerOrOracle {
        uint256 stakeAmount = stakes[developer];
        require(stakeAmount > 0, "No stake to slash");
        
        stakes[developer] = 0;
        emit Slashed(developer, stakeAmount);
    }
    
    function reward(address developer) public payable onlyOwnerOrOracle {
        require(stakes[developer] > 0, "Developer not staked");
        require(msg.value > 0, "Reward must be greater than 0");
        
        payable(developer).transfer(msg.value);
        emit Rewarded(developer, msg.value);
    }
}
