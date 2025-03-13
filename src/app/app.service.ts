import { Injectable } from '@nestjs/common'

@Injectable()
export class AppService {
    getHello(body: any): any {
        console.log(body)
        return body
    }
}
