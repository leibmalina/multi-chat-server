/**
 * The prototype of UserTable, a table used to keep multiple users' data.
 */

function UserTable() {
    this.data = {};
    this.name2idMap = {};
}

/**
 * @param id {string}
 * @param name {string}
 * @return {boolean} true when success, false when the name exists
 */
UserTable.prototype.addUser = function (id, name) {
    if (this.name2idMap[name] !== undefined)
        return false;

    this.data[id] = {
        name: name,
        room: 'lobby'
    };
    this.name2idMap[name] = id;
    return true;
}

/**
 * @param id {string}
 * @return {boolean|Object} the deleted user's data when success, false otherwise
 */
UserTable.prototype.removeUser = function (id) {
    let user_name = this.data[id].name;

    delete this.name2idMap[user_name];
    delete this.data[id];
}

/**
 * @param id {string}
 * @return {Object|undefined} the user's data, may be undefined
 */
UserTable.prototype.getUserData = function (id) {
    let userData = this.data[id];
    if (userData === undefined)
        return false;

    return this.data[id];
}


module.exports = UserTable;
