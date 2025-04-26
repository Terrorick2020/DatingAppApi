import { ConnectionDto } from './dto/connection.dto'
import {
    ConnectionStatus, 
    type ResServerConnection,
    type ResErrData,
} from './micro.type'

export abstract class AbstractMicroController{
    protected ResErrData: ResErrData

    constructor() {
        this.ResErrData = {
            message: 'Возникла ошибка при выполнении действия',
            status: ConnectionStatus.Error,
        }
    }

    protected abstract abstractJoinRoom(
        connectionDto: ConnectionDto,
    ): Promise<ResServerConnection | ResErrData>

    protected abstract abstractLeaveRoom(
        connectionDto: ConnectionDto,
    ): Promise<ResServerConnection | ResErrData>
}
