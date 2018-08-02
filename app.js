const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const port = process.env.PORT || 9000;
const bodyParser = require('body-parser');
app.use(bodyParser.json());       // to support JSON-encoded bodies
app.use(express.static(__dirname + '/node_modules'));

/* serves main page */
app.get("/", function (req, res) {
    log("INFO",'GET', "main page request, sending index.html");
    res.status(200);
    res.sendFile(__dirname + '/index.html')
});

app.post("/register", function (req, res) {
    let data = req.body;
    //check if the name is available
    if (data.username in users_db) {
        log('WARNING', 'POST', data.username + ' has tried to register with an already existing name!');
        res.status(403);
        res.send("Username is unavailable!");
        return;
    }

    //check if the name is available
    if (!data.password) {
        log('WARNING', 'POST', data.username + ' has tried to register with empty password!');
        res.status(403);
        res.send("Password cannot be empty!");
        return;
    }

    let newuser = new user(data.username, data.password);
    //add the user to the database
    users_db[data.username] = newuser;

    log("INFO", 'POST', "New user registered - username: " + data.username + " password: " + data.password);
    res.status(200);
    res.send("Success!");
});

app.get("/chathistory", function (req, res) {
    let user1 = req.param('user1');
    let user2 = req.param('user2');
    let msgs = [];
    for (i in msgs_history) {
        if (msgs_history[i].to == user1 || msgs_history[i].to == user2 || msgs_history[i].from == user1 || msgs_history[i].from == user2)
            msgs.push(msgs_history[i]);
    }
    log('INFO', 'GET', 'chathistory requested of ' + user1 + ' and ' + user2);
    res.status(200);
    res.send(JSON.stringify(msgs));
});

app.get("/getusers", function (req, res) {
    log('INFO', 'GET', 'getuser request');
    res.status(200);
    res.send(JSON.stringify(Object.keys(users_db)));
});


/* serves all the static files */
app.get(/^(.+)$/, function (req, res) {
    log('INFO', 'GET', 'static file request: ' + req.params[0]);
    res.status(200);
    res.sendFile(__dirname + req.params[0]);
});

server.listen(port, function () {
    log("INFO", 'express', "Server started on " + port);
});

io.on('connection', function (client) {
    log("INFO", 'SOCKET', "Client connected...");

    client.on('subscribe', function (data) {
        subscribe(client, data);
    });

    client.on('unsubscribe', function (data) {
        unsubscribe(client, data);
    });

    client.on('join', function (data) {
        userConnectingHandler(client, data);
    });
    client.on('newMessage', function (data) {
        processMessage(client, data);
    });
    client.on('disconnect', function () {
        removeUser(client.id);
    });

});



let users_db_by_socket = {};
let users_db = {};
let msgs_history = [];

class user {
    constructor(userName, userPassword) {
        //current client session and if he's online
        this.client = null;
        //the user info
        this.userName = userName;
        this.userPassword = userPassword;
        //to see who wants updates about this user
        this.friends = {};
        //last time this user was active
        this.lastseen = Date.now();
    }

    sendMsg(msgDescriptor) {
        msgs_history.push(msgDescriptor);
        if (this.client != null)
        this.client.emit('newMessage', msgDescriptor);
    }

    sendusersStatusList() {
        //0 offline {}
        //1 online {}
        if (this.client == null)
            return;
                                
        let friendsStatusList = [[],[]];
        for (let friend in this.friends) {
            if (users_db[friend].isOnline())
                friendsStatusList[1].push(friend);
            else
                friendsStatusList[0].push(friend);
        }
        log("INFO", 'SOCKET', "sent users statulist update to " + this.userName);
        this.client.emit('usersStatusList', JSON.stringify(friendsStatusList));
    }

    alertFriendsThisUserConnected() {
        for (let friend in this.friends) {
            users_db[friend].sendusersStatusList();
        }
    }

    addFriend(name) {
        this.friends[name] = 1;
        users_db[name].friends[this.userName] = 1;
        this.sendusersStatusList();
        users_db[name].sendusersStatusList();
    }

    removeFriends(name) {

        delete this.friends[name];
        delete users_db[name].friends[this.userName];
        this.sendusersStatusList();
        users_db[name].sendusersStatusList();

    }

    disconnectUser() {
        log("INFO", "Client disconnected as " + this.userName);
        this.lastseen = Date.now();
        this.client = null;

        for (let friend in this.friends) {
            users_db[friend].sendusersStatusList();
        }
    }

    isOnline()
    {
        return (this.client != null);
    }
};

function userConnectingHandler(client, userInfo) {

    let userName = userInfo.username;
    let password = userInfo.password;
    //check if the name is available
    if (!(userName in users_db) || users_db[userName].userPassword != password) {
        log('WARNING', 'SOCKET', "Connection refued for: username: " + userName + ' password: ' + password);
        client.emit('errorMessage', 'username or password invalid');
        client.disconnect();
        return;
    }

    if (users_db[userName].client != null) {
        log('WARNING', 'SOCKET', userName + ' username doesnt exist');
        client.emit('errorMessage', 'Connected on another device');
        client.disconnect();
    }
    users_db[userName].client = client;
    users_db_by_socket[client.id] = users_db[userName]
    users_db[userName].sendusersStatusList();
    users_db[userName].alertFriendsThisUserConnected();
    log("INFO", 'SOCKET', userName + ' signed in');
}

function subscribe(client, data) {
    log("INFO", 'SOCKET', users_db_by_socket[client.id].userName +  " requested to subscribe to " + data);
    users_db_by_socket[client.id].addFriend(data);
}

function unsubscribe(client, data) {
    log("INFO", 'SOCKET', users_db_by_socket[client.id].userName +  "requested to unsubscribe from " + data);
    users_db_by_socket[client.id].removeFriend(data);
}

//not in use
function removeUser(clientId) {

    if (clientId in users_db_by_socket) {
        let user = users_db_by_socket[clientId];
        user.disconnectUser();
        delete users_db_by_socket[clientId];
        log("INFO", user.userName + ' has disonnected!');
    }
}

function processMessage(client, data) {
    let ip = client.handshake.address;
    let sender = users_db_by_socket[client.id];

    //check user exists
    if (!sender) {
        log("WARNING",'SOCKET', 'unregistered user tried to send a msg!');
        client.emit('errorMessage', 'You are not registered correctly, please retry again.');
        return;
    }

    //check user can impersonate that user
    if (data.from != sender.userName) {
        log("WARNING", 'SOCKET', sender.userName + ' tried to impersonate ' + sender.from);
        client.emit('errorMessage', 'You are not allowed to impersonate the user' + sender.from);
        return;
    }

    //check recipient exisits
    let recp = users_db[data.to];
    if (!recp) {
        log("WARNING", 'SOCKET', sender.userName + ' tried to send msg to a non exisiting user: ' + data.to);
        client.emit('errorMessage', 'User does not exist!');
        return;
    }

    //send message
    data.message = cleanhtml(data.message);
    recp.sendMsg(data);
    log("INFO", 'SOCKET', 'From: ' + data.from + ' To: ' + data.to + ' --- message: ' + data.message);
}


function cleanhtml(input) {
    input = input.replace(/&/g, "&amp;");
    input = input.replace(/</g, "&lt;");
    input = input.replace(/>/g, "&gt;");
    input = input.replace(/\n$/, "");
    return input;
}

function log(level,method, info) {
    console.log(level + '(' + method  + '): ' + info);
}
