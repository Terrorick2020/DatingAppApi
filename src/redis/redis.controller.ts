import { Body, Controller, Get, Param, Patch } from '@nestjs/common'
import { RedisService } from './redis.service'
import { UpdateActivityDto } from './dto/update-activity.dto'

@Controller('activity')
export class RedisController {
	constructor(private readonly redisService: RedisService) {}

	@Patch()
	updateActivity(@Body() dto: UpdateActivityDto) {
		return this.redisService.updateActivity(dto)
	}

	@Get(':telegramId')
	getActivity(@Param('telegramId') telegramId: string) {
		return this.redisService.getActivity(telegramId)
	}

	@Get()
	getOnlineUsers() {
		return this.redisService.getOnlineUsers()
	}
}
