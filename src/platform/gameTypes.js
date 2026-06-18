/**
 * @typedef {object} GameDefinition
 * @property {string} id
 * @property {string} name
 * @property {string} emoji
 * @property {string} description
 * @property {number} maxPlayers
 * @property {number} minPlayers
 * @property {import('react').ComponentType<any>} RoomView
 * @property {(hostId: string, ctx: object) => object} createEngine
 * @property {(msg: object, guestSocketId: string, ctx: object) => boolean} handleHostMessage
 * @property {(msg: object, ctx: object) => boolean} handleGuestMessage
 * @property {(ctx: object) => object} createHandlers
 */

export {};
