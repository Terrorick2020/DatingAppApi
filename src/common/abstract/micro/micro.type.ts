export enum ConnectionStatus {
    Error = 'error',
    Success = 'success',
}

export interface ResTcpConnection {
    roomName: string | null
    telegramId: string | null
    message?: string
    status: ConnectionStatus
}

export enum TcpPattern {
    JoinRoom = 'joinRoom',
    LeaveRoom = 'leaveRoom',
}
