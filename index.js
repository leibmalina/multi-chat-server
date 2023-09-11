const http = require('http'),
    fs = require('fs');

const UserTable = require('./UserTable');
const RoomTable = require('./RoomTable');

const port = 3456;

const server = http.createServer(function (req, res) {
    switch (req.url) {
        case "/":
            fs.readFile('client.html', function (err, data) {
                if (err) return res.writeHead(500);
                res.writeHead(200);
                res.end(data);
            });
            break;
        case "/client.css":
            fs.readFile('client.css', function (err, data) {
                if (err) return res.writeHead(500);
                res.writeHead(200);
                res.end(data);
            });
            break;
        case "/client.js":
            fs.readFile('client.js', function (err, data) {
                if (err) return res.writeHead(500);
                res.writeHead(200);
                res.end(data);
            });
            break;
        default:
            res.writeHead(302, {'Location': '/'});
            res.end();
            break;
    }
});
server.listen(port);

// noinspection JSValidateTypes
const socketio = require('socket.io')(http, {
    wsEngine: 'ws'
});

const io = socketio.listen(server);

// The table to keep user's and rooms' data
const users = new UserTable();
const rooms = new RoomTable();

// Add lobby as initial room (no owner or password)
rooms.addRoom('lobby', "", "");

/*
 This callback runs when a new Socket.IO connection is established.
 About rooms: https://socket.io/docs/v4/rooms/
 */
io.sockets.on('connection', function (socket) {

    /*
    Check and set user's name when he connects to the server

    Input: data {
        name: {string}
    }
     */
    socket.on('set_name', data => {
        let name = data['name'];

        // Check name and try add user
        if (name == null) {
            io.sockets.to(socket.id).emit("bad_user_name", {
                err: "Name cannot be null."
            });
            return;
        }
        name = name.toString().trim();
        if (name === "System" || name.length > 30 || name.length < 3
            || !users.addUser(socket.id, name)) {
            io.sockets.to(socket.id).emit("bad_user_name", {
                err: "Name exists."
            });
            return;
        }

        io.sockets.to(socket.id).emit("good_user_name", {
            name: users.getUserData(socket.id).name
        });
        io.sockets.to(socket.id).emit('message_to_client', {
            message: `You joined room "lobby" as "${users.getUserData(socket.id).name}"`,
            name: 'System'
        });
        switch_room(socket, 'lobby');

        console.log(`${users.getUserData(socket.id).name}(${socket.id}) connected`);
    })

    /*
    Remove the user's data when he disconnects
     */
    socket.on('disconnect', () => {
        console.log("disconnected user id: " + socket.id);
        let userData = users.getUserData(socket.id);
        if(userData === false) return;

        // if user that disconnected is owner of room, randomly assign ownership to another user in room
        let user_id = users.name2idMap[userData['name']];
        if(user_id === undefined) return false;
        console.log("room owner id: " + rooms.data[userData.room]['owner']);
        console.log("current user id: " + user_id);
        if(rooms.data[userData.room]['owner'] === user_id) {
            let usersArr = Object.keys(rooms.data[userData.room].users); // store user ids in array
            console.log("user array before removing owner: " + usersArr.toString());
            // remove current owner from array:
            let curr_owner_index = usersArr.indexOf(socket.id);
            if(curr_owner_index === null) return;
            usersArr.splice(curr_owner_index, 1);
            console.log("user array after removing owner: " + usersArr.toString());

            // select random user to assign ownership
            if(usersArr.length >= 1) {
                let randArrIndex = Math.floor(Math.random() * usersArr.length);
                let random_owner_id = usersArr[randArrIndex].toString();
                console.log("random new owner id: " + random_owner_id);
                //let new_owner_name = users.getUserData(random_owner_id)['name'].toString();
                //console.log("random new owner name: " + new_owner_name);
                // make client side call to transfer ownership to new owner
                io.sockets.to(random_owner_id).emit('owner_disconnected', {new_owner_id: random_owner_id});
            }
        }

        // handle if user was in a private conversation:
        io.sockets.to(socket.id).emit('disconnecting_PM');

        // record removal of user
        users.removeUser(socket.id);
        rooms.leaveRoom(userData.room, socket.id);
        console.log(`${userData.name}(${socket.id}) disconnected`);
    })

    /*
    Handles the user's message

    Input: data {
        message: {string}
    }
     */
    socket.on('message_to_server', data => {
        let userData = users.getUserData(socket.id);
        if (userData === undefined) return;
        let message = data['message'];
        if (message == null) return;
        message = message.toString().substr(0, 500);
        if (message.length === 0) return;
        if (rooms.data[userData.room].banned_users[socket.id] != null) return;

        let message_type = data['type'];
        let recipient;
        if(data['recipient'] === "group" && message_type === "group_message") {
            recipient = userData.room;
        } else {
            // verify this is private message
            if(message_type !== "private_message") return;
            // get recipient id from username passed in
            recipient = users.name2idMap[data['recipient']];
            if(recipient === undefined) return;
        }
        // message to group / private message
        io.sockets.to(recipient).emit('message_to_client', {
            message: message,
            name: userData.name
        });
        // display message for sender
        if(message_type === "private_message") {
            io.sockets.to(socket.id).emit('message_to_client', {
                message: message,
                name: userData.name
            });
        }
        console.log(`${userData.name}(${socket.id}): ${message}`);
    });

    // handle when user initially starts private conversation
    socket.on("start_private_message", data => {
        if(data['recipient'] === null) return;
        // get user ids from names
        let recipient_id = users.name2idMap[data['recipient']].toString();
        let userData = users.getUserData(socket.id);
        let initiator_name = userData['name'];
        // notify users of conversation
        io.sockets.to(recipient_id).emit('message_to_client', {
            message: initiator_name + " started a private conversation with you. Click the Group Message button on the left to respond to group messages instead",
            name: "System"
        });
        io.sockets.to(socket.id).emit('message_to_client', {
            message: "You started a private conversation with " + data['recipient'],
            name: "System"
        });
        // move the recipient into the private conversation as well:
        io.sockets.to(recipient_id).emit('received_PM', {
            initiator_name: initiator_name
        });
    })

    // handle when user leaves conversation (notify other user)
    socket.on("end_PM", data => {
        if(data['private_messenger'] === null) return;
        // get user ids from names
        let recipient_id = users.name2idMap[data['private_messenger']].toString();
        let userData = users.getUserData(socket.id);
        let initiator_name = userData['name'];
        // notify users of conversation
        io.sockets.to(recipient_id).emit('message_to_client', {
            message: initiator_name + " ended the private conversation with you. You can re-start conversation using Private Message button for the user",
            name: "System"
        });
        io.sockets.to(socket.id).emit('message_to_client', {
            message: "You ended the private conversation with " + data['recipient'],
            name: "System"
        });
        // end conversation for recipient:
        io.sockets.to(recipient_id).emit('ending_PM', {
            initiator_name: initiator_name
        });
    });

    /*
    Handles room switching message

    Input: data {
       room_name: {string} // name of new room user wants to join
       room_password: {string} // password of new room (if no password was requested, an empty string will be passed)
    }
     */
    socket.on('switch_room', data => {
        if(data['room_name'] == null) {
            io.sockets.to(socket.id).emit("bad_switch_room", {
                err: "Name cannot be null."
            });
            return;
        }
        let room_name = data['room_name'].toString().trim();
        let room_pass = data['room_password'] == null ?
            "" : data['room_password'].toString().trim();

        // check room exists and password is correct
        if(rooms.data[room_name] === undefined) {
            io.sockets.to(socket.id).emit("bad_switch_room", {
                err: "Room does not exist."
            });
            return;
        }
        if(rooms.data[room_name].password !== room_pass) {
            io.sockets.to(socket.id).emit("bad_switch_room", {
                err: "Wrong password."
            });
            return;
        }

        let user_data = users.getUserData(socket.id);
        if (user_data === undefined) {
            io.sockets.to(socket.id).emit("bad_switch_room", {
                err: "You are not formally connected."
            });
            return;
        }
        // check user isn't banned from room
        if (rooms.data[room_name].banned_users[socket.id] !== undefined) {
            io.sockets.to(socket.id).emit("bad_switch_room", {
                err: "You are banned from this room."
            });
            return;
        }
        // check the user isn't the room's owner
        if (rooms.data[user_data.room].owner === socket.id) {
            io.sockets.to(socket.id).emit("message_to_client", {
                message: "You must transfer your ownership by clicking on the user name before existing the room.",
                name: 'System'
            });
            return;
        }

        io.sockets.to(socket.id).emit("good_switch_room");
        switch_room(socket, room_name);
        // print to message box
        io.sockets.to(socket.id).emit('message_to_client', {
            message: `You joined room "${room_name}"`,
            name: 'System'
        });

        console.log(`${user_data.name}(${socket.id}) joined room ${room_name}`);
    });

    /*
    Handles creating room

    Input: data {
       room_name: {string} // name of new room user wants to join
       room_password: {string} // password of new room, empty for no password
    }
     */
    socket.on('create_room', data => {
        // check valid input
        if(data['room_name'] == null) {
            io.sockets.to(socket.id).emit("bad_create_room", {
                err: "Name cannot be null."
            });
            return;
        }
        let room_name = data['room_name'].toString().trim();
        if (room_name.length < 3 || room_name.length > 30 || room_name === 'lobby') {
            io.sockets.to(socket.id).emit("bad_create_room", {
                err: "Name is invalid."
            });
            return;
        }

        let room_pass = data['room_password'] == null ?
            "" : data['room_password'].toString();
        let user_data = users.getUserData(socket.id); // get current user's data
        if (user_data === undefined) {
            io.sockets.to(socket.id).emit("bad_create_room", {
                err: "You are not formally connected."
            });
            return;
        }
        if (user_data.room !== 'lobby') {
            io.sockets.to(socket.id).emit("bad_create_room", {
                err: "You must go to lobby to create new room."
            });
            return;
        }

        // try to add new room to table
        if(!rooms.addRoom(room_name, socket.id, room_pass)) {
            io.sockets.to(socket.id).emit("bad_create_room", {
                err: "Name already exists."
            });
            return;
        }

        io.sockets.to(socket.id).emit("good_create_room");
        switch_room(socket, room_name);
        // print to message box
        io.sockets.to(socket.id).emit('message_to_client', {
            message: `You created and joined room "${room_name}"`,
            name: 'System'
        });

        console.log(`${user_data.name}(${socket.id}) creates room ${room_name}`);
    })

    /*
    Handles owner operations

    Input: data {
        other_user_name: {string}
    }

     */
    socket.on('owner_operations', data => {
        // check user is the room owner
        let owner_user_data = users.getUserData(socket.id);
        let room_name = owner_user_data.room;
        let owner_user_name = owner_user_data.name;
        if(rooms.data[room_name].owner !== socket.id) {
            // emit failure
            io.sockets.to(socket.id).emit('message_to_client', {
                message: `You cannot perform operation on "${data['other_user_name']}" because you are not the owner.`,
                name: 'System'
            });
            return;
        }

        if (data['other_user_name'] == null) {
            io.sockets.to(socket.id).emit('message_to_client', {
                message: `The user's name cannot be null."`,
                name: 'System'
            });
            return;
        }
        let other_user_id = users.name2idMap[data['other_user_name']];
        // check the banned one is in the same room
        if(other_user_id == null ||
            rooms.data[room_name].users[other_user_id] === undefined) {
            // emit failure
            io.sockets.to(socket.id).emit('message_to_client', {
                message: `You cannot perform operation on "${data['other_user_name']}" 
                because they are not in the room.`,
                name: 'System'
            });
            return;
        }
        if (other_user_id === socket.id) {
            io.sockets.to(socket.id).emit('message_to_client', {
                message: `You cannot perform operation on yourself.`,
                name: 'System'
            });
            return;
        }

        console.log("in owner operation, now transferring....");

        if(data['operation'] === "ban") {
            // record user as banned, send messages
            rooms.data[room_name].banned_users[other_user_id] = data['other_user_name']; // add user to list of users banned from room
            io.sockets.to(other_user_id).emit('message_to_client', {
                message: `You are banned from "${room_name}" by user "${owner_user_name}".`,
                name: 'System'
            });
            io.sockets.to(socket.id).emit('message_to_client', {
                message: `You successfully banned "${data['other_user_name']}" from your room.`,
                name: 'System'
            });
            io.sockets.to(other_user_id).emit("kicked_out"); // kick user out from room
        } else if (data['operation'] === "kick") {
            // send kick messages
            io.sockets.to(other_user_id).emit('message_to_client', {
                message: `You were kicked from "${room_name}" by user "${owner_user_name}".`,
                name: 'System'
            });
            io.sockets.to(socket.id).emit('message_to_client', {
                message: `You successfully kicked "${room_name}" from your room.`,
                name: 'System'
            });
            io.sockets.to(other_user_id).emit("kicked_out"); // kick user out from room
        } else if (data['operation'] === "transfer") {
            // transfer ownership of room
            rooms.data[room_name].owner = other_user_id;
            console.log("owner id is now: " + other_user_id);
            // print success messages
            io.sockets.to(other_user_id).emit('message_to_client', {
                message: `You were made owner of "${room_name}" by user "${owner_user_name}".`,
                name: 'System'
            });
            io.sockets.to(socket.id).emit('message_to_client', {
                message: `You successfully made "${data['other_user_name']}" owner of your room. You are welcome to join another room now.`,
                name: 'System'
            });
        } else {
            // print error message
            io.sockets.to(socket.id).emit('message_to_client', {
                message: `Error - Please select valid operation.`,
                name: 'System'
            });
        }
    })

    // transfer ownership without checking permissions (handler for when owner disconnects from socket)
    socket.on('force_transfer', data => {
        console.log("------ in force transfer now -----");
        let user_id = data['transfer_user_id'].toString();
        if(user_id === undefined) return;
        console.log("user id: " + user_id);
        let room_name = users.getUserData(user_id)['room'];
        if(room_name === null || room_name === undefined) return;
        // transfer ownership of room
        console.log("room name " + room_name);
        rooms.data[room_name].owner = user_id;
        // print success messages
        io.sockets.to(user_id).emit('message_to_client', {
            message: `You were made owner of "${room_name}" because the previous owner left.`,
            name: 'System'
        });
    });
});


/**
 * Make the user leave the old room and join a new one.
 * One user can be in one room at a time.
 * All other operations (such as private messages) should be done in other ways.
 *
 * @param user_socket {Socket}
 * @param new_room_name {string}
 */
function switch_room(user_socket, new_room_name) {
    let user_data = users.getUserData(user_socket.id);
    let old_room_name = user_data.room;

    // leave old room
    user_socket.leave(old_room_name);
    rooms.leaveRoom(old_room_name, user_socket.id);

    // join new room
    user_socket.join(new_room_name);
    rooms.addUser(new_room_name, user_socket.id);
    users.data[user_socket.id].room = new_room_name;

    io.sockets.to(user_socket.id).emit("join_room", {
        room: new_room_name,
        is_owner: false
    });

    let names = [];
    Object.keys(rooms.data[new_room_name].users).forEach(id => {
        let userData = users.getUserData(id);
        if (userData !== undefined) names.push(userData.name);
    })
    io.sockets.to(new_room_name).emit("update_room_members", {
        members: names
    });
    if (rooms.data[old_room_name] != null) {
        names = [];
        Object.keys(rooms.data[old_room_name].users).forEach(id => {
            let userData = users.getUserData(id);
            if (userData !== undefined) names.push(userData.name);
        })
        io.sockets.to(old_room_name).emit("update_room_members", {
            members: names
        });
    }
}