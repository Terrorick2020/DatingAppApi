import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Patch,
	Query,
	UseGuards,
} from '@nestjs/common'
import { AdminOnly } from '../common/decorators/admin-only.decorator'
import { UpdateUserDto } from './dto/update-user.dto'
import { UserService } from './user.service'
import { FindAllUsersDto } from './dto/find-all-users.dto'
import { ApiOperation, ApiResponse } from '@nestjs/swagger'
import { UserStatusGuard } from '../common/guards/user-status.guard'
import { DeleteUserDto } from './dto/delete-user.dto'

@Controller('user')
export class UserController {
	constructor(private readonly userService: UserService) {}

	@Get()
	findAll(@Query() queryParams: FindAllUsersDto) {
		return this.userService.findAll(queryParams)
	}

	@Patch(':telegramId')
	update(@Param('telegramId') telegramId: string, @Body() dto: UpdateUserDto) {
		return this.userService.update(telegramId, dto)
	}

	@AdminOnly()
	@Delete(':telegramId')
	remove(@Param('telegramId') telegramId: string) {
		return this.userService.remove(telegramId)
	}

	@ApiOperation({ summary: 'Удаление пользователя и всех связанных данных' })
	@ApiResponse({
		status: 200,
		description: 'Пользователь успешно удален',
	})
	@ApiResponse({
		status: 404,
		description: 'Пользователь не найден',
	})
	@UseGuards(UserStatusGuard)
	@AdminOnly()
	@Delete('delete-user')
	async deleteUser(@Body() deleteUserDto: DeleteUserDto) {
		return this.userService.deleteUser(deleteUserDto)
	}

	@ApiOperation({ summary: 'Самоудаление пользователя' })
	@ApiResponse({
		status: 200,
		description: 'Ваш аккаунт успешно удален',
	})
	@UseGuards(UserStatusGuard)
	@Delete('delete-self/:telegramId')
	async deleteSelf(@Param('telegramId') telegramId: string) {
		return this.userService.deleteUser({
			telegramId,
			reason: 'Самоудаление пользователя',
		})
	}

	@Get(':telegramId')
	findByTelegramId(@Param('telegramId') telegramId: string) {
		return this.userService.findByTelegramId(telegramId)
	}

	@Get('public/:telegramId')
	getPublicProfile(@Param('telegramId') telegramId: string) {
		return this.userService.getPublicProfile(telegramId)
	}
}
