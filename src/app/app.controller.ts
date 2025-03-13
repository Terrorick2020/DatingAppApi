import { Controller, Post, Body } from '@nestjs/common'
import { AppService } from './app.service'

@Controller()
export class AppController {
    constructor(private readonly appService: AppService) {}

    @Post('hello')
    getHello(@Body() body: any): any {
        return this.appService.getHello(body)
    }
}
