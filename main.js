//Name of the client
let clientName;
//socket
let socket = null;
//Is trying to connect or connected to server
let connected = false;
//current selected chat jname
let activeChannelID = 'default';
//list of friends // friends
let channelList = {};
//channelName, name, online

//const DOM elements
const DOM = {
    alert: document.querySelector('#alertdiv'),
    userName: document.querySelector('#clientNameText'),
    userPassword: document.querySelector('#clientPasswordText'),
    loginForm: document.querySelector('#loginform'),
    signinButton: document.querySelector('#connectBtn'),
    disconnectButton: document.querySelector('#disconnectBtn'),
    sendText: document.querySelector('#sendText'),
    onlineList: document.querySelector('#onlineList'),
    offlineList: document.querySelector('#offlineList'),
    chatBodies: document.querySelector('#chatbodies'),
    welcomeSpan: document.querySelector('#welcome_span'),
    allUsers: document.querySelector('#allUsers'),
    searchTextbox: document.querySelector('#searchTextbox'),  
};

function connect() {
    closeAlert();
    if (!DOM.userName.value || !DOM.userPassword.value) {
        displayAlert('Username or password must not be empty!');
        return;
    }
    if (connected) {
        displayAlert('Already connected!');
        return;
    }
    connected = true;
    DOM.loginForm.style.display = "none";
    DOM.disconnectButton.style.display = "";
    clientName = DOM.userName.value;
    DOM.welcomeSpan.innerHTML = "welcome " + clientName;

    socket = io.connect();
    socket.on('connect', function (client) {
        console.log('Connected to server!');
    });

    socket.on('usersStatusList', function (data) {
        console.log('onlinelist ' + JSON.parse(data));
        data = JSON.parse(data);
        usersStatusList(data);
    });

    socket.on('newMessage', function (msgDescriptor) {
        console.log('Recived new msg!');
        handleIncomingMsg(msgDescriptor.from + ': ' + msgDescriptor.message, msgDescriptor.from);
    });

    socket.on('disconnect', function (data) {
        console.log('disconnected from server!');
        disconnect();
    });

    socket.on('errorMessage', function (data) {
        displayAlert("<strong>Error!</strong> " + data);
        console.log('Critical Error: ' + data);
    });

    socket.emit('join', {"username":DOM.userName.value, "password":DOM.userPassword.value});
}

function disconnect() {
    if (!connected) {
        displayAlert('Not connected!');
        return;
    }
    if (socket) {
        socket.disconnect();
    }
    socket = null;
    connected = false;
    DOM.welcomeSpan.innerHTML = "welcome";
    DOM.disconnectButton.style.display = "none";
    DOM.loginForm.style.display = "block";
    activeChannelID = 'default';
    purge();
}

function purge() {
    DOM.onlineList.innerHTML = "<a>> Online</a>";
    DOM.offlineList.innerHTML = "<a>> Offline</a>";
    DOM.chatBodies.innerHTML = "";
}

function cleaninput(input) {
    input = input.replace(/&/g, "&amp;");
    input = input.replace(/</g, "&lt;");
    input = input.replace(/>/g, "&gt;");
    input = input.replace(/\n$/, "");
    return input;
}

//onlineUserList event
function usersStatusList(data) {

    for (let i in data[0]) {
        let name = data[0][i];
        if (getChannelSelector(name) != null)
            DOM.offlineList.appendChild(getChannelSelector(name));
        else {
            DOM.offlineList.innerHTML += `<a id="channel_${name}" class="friendsListItem inactive" onclick="switchChat(event,'${name}')" >${name}</a>`;
            channelList[name] = { "name": activeChannelID, "new": 0 };
        }
    }
    for (let i in data[1]) {
        let name = data[1][i];
        if (getChannelSelector(name) != null)
            DOM.onlineList.appendChild(getChannelSelector(name));
        else {
            DOM.onlineList.innerHTML += `<a id="channel_${name}" class="friendsListItem inactive" onclick="switchChat(event,'${name}')" >${name}</a>`;
            channelList[name] = { "name": activeChannelID, "new": 0 };
        }
    }


}

//offlineUserList event
function removeUserSelector(name) {
    let div = document.querySelector(`#channel_${name}`);
    if (div != null ) {
        div.parentNode.removeChild(div);
    }
}

//newMessage event
function handleIncomingMsg(msg, name) {
    appendChatBox(msg, name);

    if (getChannelSelector(name).className.includes('inactive')) {
        channelList[name].new = channelList[name].new + 1;

        getChannelSelector(name).innerHTML = `${name} (${channelList[name].new})`;
        if (!getChannelSelector(name).className.includes('newmsg')) {
            getChannelSelector(name).className += " newmsg";
        }
    }

}

function appendChatBox(msg, name) {
    let channel_body = document.querySelector("#channel_body_" + name);

    if (channel_body == null)
        return;
    channel_body.innerHTML += `<span class="textItem">${msg}</span>`;
    DOM.chatBodies.scrollTop =  DOM.chatBodies.scrollHeight -  DOM.chatBodies.clientHeight;
}

//this client sends a msg
function sendmg() {
    //prepare vars
    closeAlert();
    let msgDescriptor = {
        "from": clientName,
        "to": activeChannelID,
        "date": 0,
        "message": DOM.sendText.value
    };
    DOM.sendText.value = '';

    //check msg is valid
    if (!(msgDescriptor.message && msgDescriptor.message.trim())) {
        return;
    }
    //
    appendChatBox('You: ' + cleaninput(msgDescriptor.message), msgDescriptor.to);

    if (connected) {
        socket.emit('newMessage', msgDescriptor);
    } else {
        appendChatBox('Message was not delieved, you are not connected', msgDescriptor.to);
    }
}

//client press on a different channel
function switchChat(evt, selectedChannelID) {
    closeAlert();
    if (activeChannelID != selectedChannelID) {
        //inactivate last selector
        if (getChannelSelector(activeChannelID) != null)
            getChannelSelector(activeChannelID).className = getChannelSelector(activeChannelID).className.replace("active", "inactive");

        //hide last body
        if (getChannelBody(activeChannelID) != null)
            getChannelBody(activeChannelID).style.display = "none";
    }

    //switch to the new channel
    activeChannelID = selectedChannelID;

    getChannelSelector(activeChannelID).className = getChannelSelector(activeChannelID).className.replace(" newmsg", "");
    getChannelSelector(activeChannelID).className = getChannelSelector(activeChannelID).className.replace("inactive", "active");
    getChannelSelector(activeChannelID).innerHTML = activeChannelID;


    if (getChannelBody(activeChannelID) != null)
        getChannelBody(activeChannelID).style.display = "";
    else {
        //create new body and download the history
        DOM.chatBodies.innerHTML += `<div id="channel_body_${activeChannelID}" class="chatbody"></div>`;
        loadChatHistory(activeChannelID);
    }
    DOM.chatBodies.scrollTop = DOM.chatBodies.scrollHeight - DOM.chatBodies.clientHeight;
    //evt.currentTarget.className += " active";
    //evt.currentTarget.className = evt.currentTarget.className.replace(" newmsg", "");
    //evt.currentTarget.innerHTM = channelName;
    

}

function addFriend(name) {
    closeAlert();
    if (!connected)
        return;
    socket.emit('subscribe', name);
    DOM.searchTextbox.value = "";
    searchUser();
}

///////// GET/POST FUNCTION ////////
//POST
function registerButtonEvent() {
    httpRequest(() => { displayAlert('Registered successfully! '); }, (res) => { displayAlert('Registered failed! ' + res); }, 'POST', '/register', '', JSON.stringify({ username: DOM.userName.value, password: DOM.userPassword.value }));
}
//GET
function loadChatHistory(name) {
    if (!connected)
        return;
    let xmlhttp = new XMLHttpRequest();
    let url = "http://localhost:9000";
    let path = '/chathistory';
    let params = `user1=${clientName}&user2=${name}`;
    xmlhttp.open("GET", url + path + "?" + params, true);
    xmlhttp.setRequestHeader('Content-type', 'application/json');
    xmlhttp.onreadystatechange = function () {
        if (xmlhttp.readyState === 4) {
            if (xmlhttp.status === 200) {
                console.log(xmlhttp.responseText);
                let response = JSON.parse(xmlhttp.responseText);
                let from = "You";
                for (let i in response) {
                    if (response[i].from == clientName)
                        from = "You";
                    else
                        from = response[i].from;

                    appendChatBox(from + ': ' + response[i].message, name);
                }

            }
            else {
                displayAlert('Failed to fetch users, you might not be connected. ' + xmlhttp.responseText);
            }
        }
    }
    xmlhttp.send(JSON.stringify({ username: DOM.userName.value, password: DOM.userPassword.value }));
}
//GET
function loadAllUsers() {
    httpRequest((resp) => {
        let response = JSON.parse(resp);
        DOM.allUsers.innerHTML = "<a>> All Users</a>";
        for (let i in response) {
            if (response[i] != clientName)
                DOM.allUsers.innerHTML += `<a class="friendsListItem" onclick="addFriend('${response[i]}')" >${response[i]}</a>`;
        }
    },
        (res) => { displayAlert('Failed to fetch users, you might not be connected. ' + res); }, 'GET', '/getusers', '',
        JSON.stringify({ username: DOM.userName.value, password: DOM.userPassword.value }));
}

//get / post proxy
function httpRequest(success, fail, method, path, params, body) {
    let xmlhttp = new XMLHttpRequest();
    let url = "http://localhost:9000";
    xmlhttp.open(method, url + path + "?" + params, true);
    xmlhttp.withCredentials = true;
    xmlhttp.setRequestHeader('Content-type', 'application/json');
    xmlhttp.onreadystatechange = function () {
        if (xmlhttp.readyState === 4) {
            if (xmlhttp.status === 200)
                success(xmlhttp.responseText);
            else
                fail(xmlhttp.responseText);
        }
    }
    xmlhttp.send(body);
}
//--------- GET/POST FUNCTION --------

/////////aux functions/////////////
function searchUser() {

    if (!connected)
        return;

    if (DOM.searchTextbox.value === "") {
        DOM.onlineList.style.display = "";
        DOM.offlineList.style.display = "";
        DOM.allUsers.style.display = "none";
    }
    else {
        DOM.onlineList.style.display = "none";
        DOM.offlineList.style.display = "none";
        DOM.allUsers.style.display = "";
    }
    

    let userName = DOM.searchTextbox.value.replace(/\n/g, "");
    var i, tabcontent, tablinks;

    tabcontent = document.getElementsByClassName("friendsListItem");
    for (i = 0; i < tabcontent.length; i++) {
        if (userName === '*' || tabcontent[i].innerHTML.toUpperCase().includes(userName.toUpperCase()) || !(/\S/.test(userName)))
            tabcontent[i].style.display = "";
        else
            tabcontent[i].style.display = "none";
    }

}

function displayAlert(text) {

    DOM.alert.innerHTML = `<span class="closebtn" onclick="this.parentElement.style.display='none';">&times;</span>` + text;
    DOM.alert.style.display = "block";

}

function closeAlert() {
    DOM.alert.style.display = "none";
}

function getChannelSelector(channel_id) {
    return document.querySelector(`#channel_${channel_id}`);
}

function getChannelBody(channel_id) {
    return document.querySelector(`#channel_body_${channel_id}`);
}

//--------- aux functions --------