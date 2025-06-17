import { Injectable } from '@nestjs/common'

@Injectable()
export class AppService {
    getHello(body: any): any {
        return body
    }
}
