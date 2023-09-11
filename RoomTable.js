/**
 * The prototype of RoomTable, a table used to keep multiple rooms' data.
 */

// Constructor
function RoomTable() {
    this.data = {}; // array indexed by room name
}

/**
 * @param name {string}
 * @param owner_id {string}
 * @param password {string}
 * @return {boolean} true when success, false when the name exists
 */
// Note: owner_name and password are empty strings if not specified
RoomTable.prototype.addRoom = function (name, owner_id, password) {
    if (this.data[name] !== undefined)
        return false;

    // new room's data
    this.data[name] = {
        name: name,
        password: password,
        owner: owner_id,
        users: {}, // users in room: array of user names
        banned_users: {} // list user names that are banned from joining room
    };
    return true;
}

/**
 * add user to list of users for given name
 * @param room_name {string}
 * @param user_id {string}
 * @return {boolean} false when the room does not exist, and true otherwise
 */
RoomTable.prototype.addUser = function (room_name, user_id) {
    if (this.data[room_name] === undefined) return false;
    this.data[room_name].users[user_id] = {
        name: user_id
    };
    return true;
}

/**
 * @param room_name {string} // room user is leaving
 * @param user_id {string} // user's name
 * @return {boolean|Object} the deleted user's data when success, false when the room or user name does not exist
 */
RoomTable.prototype.leaveRoom = function (room_name, user_id) {
    if (this.data[room_name] === undefined)
        return false;
    let userData = this.data[room_name].users[user_id];
    if (userData === undefined)
        return false;

    delete this.data[room_name].users[user_id];
    if (room_name !== 'lobby' &&
        Object.keys(this.data[room_name].users).length === 0) // remove the room if there's no one in it
        delete this.data[room_name];
    return userData;
}

/**
 * @param name {string}
 * @return {Object|undefined} the room's data, may be undefined
 */
RoomTable.prototype.getRoomData = function (name) {
    return this.data[name];
}


module.exports = RoomTable;
