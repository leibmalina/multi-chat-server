const socketio = io.connect();

// store the data of the current user
let userData = {
    name: null,
    room: null,
    is_owner: false
}

// tracks private or group messaging (initialize to message whole group)
let messageStatus = {
    recipient: "group",
    type: "group_message"
}

/** Prompts for operations **/
const user_name_prompt = document.createElement('div');
user_name_prompt.classList.add('prompt');
user_name_prompt.innerHTML = `
<div>
    <h2>Welcome! Set your name.</h2>
    <p id="user_name_info"></p>
    <label>Name: (3-30 characters, unique, random on default) <input type="text" id="user_name"></label>
    <div>
        <button type="button" id="user_name_confirm" onclick="setName()">Confirm</button>
    </div>
</div>`

const new_room_prompt = document.createElement('div');
new_room_prompt.classList.add('prompt');
new_room_prompt.innerHTML = `
<div>
    <h2>New Room</h2>
    <p id="new_room_info"></p>
    <label>Name: (3-30 characters, unique, random on default) <input type="text" id="new_room_name"></label>
    <label>Password: (empty for no password) <input type="text" id="new_room_password"></label>
    <div>
        <button type="button" id="new_room_confirm" onclick="createRoom()">Confirm</button>
        <button type="button" id="new_room_cancel" onclick="document.body.removeChild(new_room_prompt)">Cancel</button>
    </div>
</div>`

const join_prompt = document.createElement('div');
join_prompt.classList.add('prompt');
join_prompt.innerHTML = `
<div>
    <h2>Join Room</h2>
    <p id="join_info"></p>
    <label>Name: <input type="text" id="join_name"/></label>
    <label>Password: (empty for no password) <input type="text" id="join_password"></label>
    <div>
        <button type="button" id="join_confirm" onclick="joinRoom()">Confirm</button>
        <button type="button" id="join_cancel" onclick="document.body.removeChild(join_prompt)">Cancel</button>
    </div>
</div>`

const group_member_ops = document.createElement('div');
group_member_ops.classList.add('prompt');
group_member_ops.innerHTML = `
<div>
    <h2>Group Member Operations</h2>
    <p id="prompt_member_name"></p>
    <p id="member_operation_info"></p>
    <div>
        <input type="hidden" id="member_operation_name">
        <button type="button" id="ban_button" onclick="banUser()">Ban User</button>
        <button type="button" id="kick_button" onclick="kickUser()">Kick User</button>
        <button type="button" id="pm_button" onclick="privateMessage()">Private Message</button>
        <button type="button" id="transfer_button" onclick="transferOwner()">Transfer Owner</button>
        <button type="button" id="member_operation_cancel" onclick="document.body.removeChild(group_member_ops)">Cancel</button>
    </div>
</div>
`


/**
 * Initialize page
  */
document.addEventListener("DOMContentLoaded", () => {
    // Register events
    document.getElementById("message_input").addEventListener("keypress", typeChar, false);
    document.getElementById("send_button").addEventListener("click", sendMessage, false);
    document.getElementById("newroom_button").addEventListener("click", () => document.body.appendChild(new_room_prompt), false);
    document.getElementById("join_button").addEventListener("click", () => document.body.appendChild(join_prompt), false);
    document.getElementById("lobby_button").addEventListener("click", backToLobby, false);
    document.getElementById("group_message_button").addEventListener("click", endCurrentPM, false);
    document.getElementById("group_message_button").style.display = "none"; // initially hide button

    // Show set name prompt
    document.body.appendChild(user_name_prompt);
    document.getElementById("user_name").value = Math.random().toString(16).substr(2, 12);
}, false);


/****************************** Event handlers ******************************/

/******************** User name related ********************/
function setName() {
    let name = document.getElementById("user_name").value;
    socketio.emit("set_name", {name: name});
}

socketio.on("good_user_name", data => {
    userData.name = data.name;
    document.body.removeChild(user_name_prompt);
})

socketio.on("bad_user_name", data => {
    document.body.appendChild(user_name_prompt);
    document.getElementById("user_name_info").innerText = data.err;
})


/******************** Room creation related ********************/
function createRoom() {
    let room_name = document.getElementById("new_room_name").value;
    let room_password = document.getElementById("new_room_password").value;
    socketio.emit("create_room", {
        room_name: room_name,
        room_password: room_password
    });
}

/*
Handles bad name or password input for create name function
Ask for new input
 */
socketio.on("bad_create_room", data => {
    document.body.appendChild(new_room_prompt);
    document.getElementById("new_room_info").innerText = data.err;
});

socketio.on("good_create_room", () => {
    document.body.removeChild(new_room_prompt);
})


/******************** Room switching related ********************/
function joinRoom() {
    let room_name = document.getElementById("join_name").value;
    let room_password = document.getElementById("join_password").value;
    socketio.emit("switch_room", {
        room_name: room_name,
        room_password: room_password
    });
}

/*
Handle bad input for join room function
Ask for new input
 */
socketio.on("bad_switch_room", data => {
    document.body.appendChild(join_prompt);
    document.getElementById("join_info").innerText = data.err;
});

socketio.on("good_switch_room", () => {
    document.body.removeChild(join_prompt);
});

function backToLobby() {
    socketio.emit("switch_room", {
        room_name: "lobby",
        room_password: ""
    })
}

socketio.on("join_room", data => {
    userData.room = data.room;
    userData.is_owner = data.is_owner;
    updateFunctionButtons();
    endCurrentPM();
});


/******************** Room members ********************/
socketio.on("update_room_members", data => {
    const user_list = document.getElementById("member_list");
    user_list.innerHTML = "";
    data.members.forEach(name => {
        let button = document.createElement("button");
        button.type = "button";
        button.textContent = name;
        button.onclick = onMemberButtonClicked;
        button.setAttribute("username", name);
        user_list.appendChild(button);
    });
});

function onMemberButtonClicked(event) {
    let name = event.currentTarget.getAttribute("username");
    document.body.appendChild(group_member_ops);
    document.getElementById("prompt_member_name").textContent = "User: " + name;
    document.getElementById("member_operation_name").value = name;
}


/******************** Ban related ********************/
function banUser() {
    socketio.emit("owner_operations", {
        other_user_name: document.getElementById("member_operation_name").value,
        operation: "ban"
    })
}


/******************** Kick related ********************/
function kickUser() {
    socketio.emit("owner_operations", {
        other_user_name: document.getElementById("member_operation_name").value,
        operation: "kick"
    })
}

// handles kicking user out after being banned or kicked out by owner
socketio.on("kicked_out", backToLobby);


/******************** PM related ********************/
function privateMessage() {
    let pm_user_name = document.getElementById("member_operation_name").value;
    // force user back into group conversation
    endCurrentPM();
    // update message status
    messageStatus['type'] = "private_message";
    messageStatus['recipient'] = pm_user_name.toString();
    startPM(pm_user_name);
    document.body.removeChild(group_member_ops); // remove the panel (equivalent to clicking cancel)
    document.getElementById("group_message_button").style.display = "block";
}

function startPM(recipient_name) {
    socketio.emit("start_private_message", {
        recipient: recipient_name
    })
}

// handles receipt of private conversation
socketio.on("received_PM", function (data) {
    // update message status
    messageStatus['type'] = "private_message";
    messageStatus['recipient'] = data['initiator_name'].toString();
    document.getElementById("group_message_button").style.display = "block";
})

// when one user leaves conversation, notify other user
function endCurrentPM() {
    // verify user is currently in private conversation
    if(messageStatus['type'] === "private_message") {
        socketio.emit("end_PM", {
            private_messenger: messageStatus['recipient']
        })
    }
    setStatusGroup();
}

// handles when one of the users leaves the site (disconnect handler)
socketio.on("disconnecting_PM", function() {
    endCurrentPM();
})

// handles ending of private conversation
socketio.on("ending_PM", function (data) {
    // update message status
    setStatusGroup();
})

// handles conversation ending for current user
function setStatusGroup() {
    messageStatus['type'] = "group_message";
    messageStatus['recipient'] = "group";
    document.getElementById("group_message_button").style.display = "none";
}

/******************** Ownership related ********************/
function transferOwner() {
    socketio.emit("owner_operations", {
        other_user_name: document.getElementById("member_operation_name").value,
        operation: "transfer"
    })
}

socketio.on("owner_disconnected", data => {
    console.log("owner disconnected client side function called");
    socketio.emit("force_transfer", {
        transfer_user_id: data['new_owner_id']
    })
});

/******************** Message related ********************/
let lastSpeaker = "";
socketio.on("message_to_client", function (data) {
    //Append an HR thematic break and the escaped HTML of the new message
    const log_panel = document.getElementById("chatlog");
    if (lastSpeaker !== data['name']) {
        log_panel.appendChild(document.createElement("hr"));
        lastSpeaker = data['name'];
    } else {
        log_panel.appendChild(document.createElement("br"));
    }
    log_panel.appendChild(document.createTextNode(`${data['name']}: ${data['message']}`));


    if (document.getElementById("auto_scroll").checked) log_panel.scrollTo(0,  log_panel.scrollHeight);
});

function sendMessage() {
    let msg = document.getElementById("message_input").value;
    if (msg.trim() !== "") {
        document.getElementById("message_input").value = "";
        socketio.emit("message_to_server", {
            message: msg,
            type: messageStatus['type'],
            recipient: messageStatus['recipient']
        });
    }
}

function typeChar(event) {
    if (event.key === "Enter") {
        sendMessage();
    }
}


/**
 * Refresh functional buttons according user's state
 */
function updateFunctionButtons() {
    document.getElementById("newroom_button").disabled = userData.room !== 'lobby';
    document.getElementById("join_button").disabled = userData.room !== 'lobby';
    document.getElementById("lobby_button").disabled = userData.room === 'lobby';
}
