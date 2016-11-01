/**
 * Copyright 2016 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

var util = require("util");

var flows = require("../flows");
var redUtil = require("../../util");
var redDebugger = require("../debugger");
var runtime;

var routes = {};
var sendQueue = [];
var paused = false;

function init(_runtime) {
    runtime = _runtime;
    wires = {};
}


function pause() {
    paused = true;
}
function resume() {
    paused = false;
    setImmediate(processSendEvent);
}


function add(sourceNode, wires) {
    routes[sourceNode.id] = wires;
}
function remove(sourceNode) {
    delete routes[sourceNode.id];
}

function processSendEvent() {
    if (!paused) {
        if (sendQueue.length > 0) {
            var sendEvent = sendQueue.shift();
            //console.log(ev.sourceNode.id+"["+ev.sourcePort+"] -> "+ev.destinationNode.id+"["+ev.destinationPort+"] : "+redDebugger.checkSendEvent(ev));
            if (!sendEvent.triggered && redDebugger.checkSendEvent(sendEvent)) {
                sendEvent.triggered = true;
                sendQueue.unshift(sendEvent);
                pause();

            } else {
                sendEvent.destinationNode.receive(sendEvent.msg);
            }
        }
        if (!paused && sendQueue.length > 0) {
            setImmediate(processSendEvent);
        }
    }
}

function send(sourceNode, msg) {
    if (msg === null || typeof msg === "undefined") {
        return;
    } else if (!util.isArray(msg)) {
        msg = [msg];
    }
    var node;
    var msgSent = false;
    var nodeWires = routes[sourceNode.id];
    if (nodeWires) {
        var numOutputs = nodeWires.length;
        var sendEvents = [];
        var sentMessageId = null;
        // for each output of node eg. [msgs to output 0, msgs to output 1, ...]
        for (var i = 0; i < numOutputs; i++) {
            var wires = nodeWires[i];
            /* istanbul ignore else */
            if (i < msg.length) {
                var msgs = msg[i]; // msgs going to output i
                if (msgs !== null && typeof msgs !== "undefined") {
                    if (!util.isArray(msgs)) {
                        msgs = [msgs];
                    }
                    var k = 0;
                    // for each recipent node of that output
                    for (var j = 0; j < wires.length; j++) {
                        node = flows.get(wires[j]); // node at end of wire j
                        if (node) {
                            // for each msg to send eg. [[m1, m2, ...], ...]
                            for (k = 0; k < msgs.length; k++) {
                                var m = msgs[k];
                                if (m !== null && m !== undefined) {
                                    /* istanbul ignore else */
                                    if (!sentMessageId) {
                                        sentMessageId = m._msgid;
                                    }
                                    var sendEvent = {
                                        sourceNode: sourceNode,
                                        sourcePort:i,
                                        destinationNode:node,
                                        destinationPort:0
                                    }

                                    if (msgSent) {
                                        sendEvent.msg = redUtil.cloneMessage(m);
                                    } else {
                                        sendEvent.msg = m;
                                        msgSent = true;
                                    }
                                    sendEvents.push(sendEvent);
                                }
                            }
                        }
                    }
                }
            }
        }
        /* istanbul ignore else */
        if (!sentMessageId) {
            sentMessageId = redUtil.generateId();
        }
        for (i=0;i<sendEvents.length;i++) {
            var ev = sendEvents[i];
            /* istanbul ignore else */
            if (!ev.msg._msgid) {
                ev.msg._msgid = sentMessageId;
            }
            sendQueue.push(ev);
        }
        sourceNode.metric("send",{_msgid:sentMessageId});
        processSendEvent();
    }
}

module.exports = {
    init:init,
    add:add,
    remove: remove,
    send:send,
    pause:pause,
    resume:resume
}
