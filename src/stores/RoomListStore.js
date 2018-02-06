/*
Copyright 2018 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
import {Store} from 'flux/utils';
import dis from '../dispatcher';
import DMRoomMap from '../utils/DMRoomMap';

/**
 * A class for storing application state for categorising rooms in
 * the RoomList.
 */
class RoomListStore extends Store {
    constructor() {
        super(dis);

        this._init();
    }

    _init() {
        // Initialise state
        this._state = {
            lists: {
                "im.vector.fake.invite": [],
                "m.favourite": [],
                "im.vector.fake.recent": [],
                "im.vector.fake.direct": [],
                "m.lowpriority": [],
                "im.vector.fake.archived": [],
            },
            ready: false,
        };
    }

    _setState(newState) {
        this._state = Object.assign(this._state, newState);
        this.__emitChange();
    }

    __onDispatch(payload) {
        switch (payload.action) {
            // Initialise state after initial sync
            case 'MatrixActions.sync': {
                if (!(payload.prevState !== 'PREPARED' && payload.state === 'PREPARED')) {
                    break;
                }

                this._matrixClient = payload.matrixClient;
                this._generateRoomLists();
            }
            break;
            case 'MatrixActions.Room.tags': {
                if (!this._state.ready) break;
                console.info(payload);
                this._generateRoomLists();
            }
            break;
            case 'MatrixActions.accountData': {
                if (payload.event_type !== 'm.direct') break;
                console.info(payload);
                this._generateRoomLists();
            }
            break;
            case 'MatrixActions.RoomMember.membership': {
                if (!this._matrixClient || payload.member.userId !== this._matrixClient.credentials.userId) break;
                console.info(payload);
                this._generateRoomLists();
            }
            break;
            case 'RoomListActions.tagRoom.pending': {
                console.info(payload);
                this._generateRoomLists(payload.request);
            }
            break;
            case 'RoomListActions.tagRoom.failure': {
                console.info(payload);
                // Reset state according to js-sdk
                this._generateRoomLists();
            }
            break;
            case 'on_logged_out': {
                console.info(payload);
                // Reset state without pushing an update to the view, which generally assumes that
                // the matrix client isn't `null` and so causing a re-render will cause NPEs.
                this._init();
            }
            break;
        }
    }

    _generateRoomLists(optimisticRequest) {
        const lists = {
            "im.vector.fake.invite": [],
            "m.favourite": [],
            "im.vector.fake.recent": [],
            "im.vector.fake.direct": [],
            "m.lowpriority": [],
            "im.vector.fake.archived": [],
        };


        const dmRoomMap = DMRoomMap.shared();

        // If somehow we dispatched a RoomListActions.tagRoom.failure before a MatrixActions.sync
        if (!this._matrixClient) return;

        this._matrixClient.getRooms().forEach((room, index) => {
            const me = room.getMember(this._matrixClient.credentials.userId);
            if (!me) return;

            if (me.membership == "invite") {
                lists["im.vector.fake.invite"].push(room);
            } else if (me.membership == "join" || me.membership === "ban" ||
                     (me.membership === "leave" && me.events.member.getSender() !== me.events.member.getStateKey())) {
                // Used to split rooms via tags
                let tagNames = Object.keys(room.tags);

                if (optimisticRequest && optimisticRequest.room === room) {
                    // Remove old tag
                    tagNames = tagNames.filter((tagName) => tagName !== optimisticRequest.oldTag);
                    // Add new tag
                    if (optimisticRequest.newTag &&
                        !tagNames.includes(optimisticRequest.newTag)
                    ) {
                        tagNames.push(optimisticRequest.newTag);
                    }
                    console.info('New tags optimistically', room.roomId, tagNames);
                }

                if (tagNames.length) {
                    for (let i = 0; i < tagNames.length; i++) {
                        const tagName = tagNames[i];
                        lists[tagName] = lists[tagName] || [];
                        lists[tagName].push(room);
                    }
                } else if (dmRoomMap.getUserIdForRoomId(room.roomId)) {
                    // "Direct Message" rooms (that we're still in and that aren't otherwise tagged)
                    lists["im.vector.fake.direct"].push(room);
                } else {
                    lists["im.vector.fake.recent"].push(room);
                }
            } else if (me.membership === "leave") {
                lists["im.vector.fake.archived"].push(room);
            } else {
                console.error("unrecognised membership: " + me.membership + " - this should never happen");
            }
        });

        this._setState({
            lists,
            ready: true, // Ready to receive updates via Room.tags events
        });
    }

    getRoomLists() {
        return this._state.lists;
    }
}

if (global.singletonRoomListStore === undefined) {
    global.singletonRoomListStore = new RoomListStore();
}
export default global.singletonRoomListStore;
