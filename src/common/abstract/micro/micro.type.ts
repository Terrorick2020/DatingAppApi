export enum ConnectionStatus {
    Error = 'error',
    Success = 'success',
}

export interface ResServerConnection {
    roomName: string
    telegramId: string
    status: ConnectionStatus
}

export interface ResErrData {
    message: string
    status: ConnectionStatus
}
