import { Injectable } from '@nestjs/common'
import { PrismaService } from '~/prisma/prisma.service'
import axios from 'axios'
import {
	successResponse,
	errorResponse,
} from '../common/helpers/api.response.helper'
import { SetGeoDto } from './dto/set-geo.dto'

@Injectable()
export class GeoService {
	private readonly yandexApiKey = process.env.YANDEX_API_KEY

	constructor(private readonly prisma: PrismaService) {}

	async getCityByCoordinates(dto: SetGeoDto) {
		try {
			const response = await axios.get('https://geocode-maps.yandex.ru/1.x/', {
				params: {
					apikey: this.yandexApiKey,
					format: 'json',
					geocode: `${dto.longitude},${dto.latitude}`,
					lang: 'ru_RU',
					results: 1,
				},
			})

			const geoObject =
				response.data.response?.GeoObjectCollection?.featureMember?.[0]
					?.GeoObject

			const city =
				geoObject?.metaDataProperty?.GeocoderMetaData?.Address?.Components?.find(
					(c: any) => c.kind === 'locality'
				)?.name || 'Unknown'
			
			if( city !== 'Unknown' ) {
				const cityValue = await this.prisma.cityes.findMany({
					where: { label: city }
				})

				if( !!cityValue.length ) {
					const res = cityValue[0]

					return successResponse({ city: res.value }, 'Город получен по координатам')
				} 
			}

			return successResponse('None', 'Город получен по координатам')
		} catch (error) {
			return errorResponse(
				'Ошибка при определении города по координатам',
				error
			)
		}
	}

	calculateDistance(
		lat1: number,
		lon1: number,
		lat2: number,
		lon2: number
	): number {
		const toRad = (x: number) => (x * Math.PI) / 180
		const R = 6371

		const dLat = toRad(lat2 - lat1)
		const dLon = toRad(lon2 - lon1)

		const a =
			Math.sin(dLat / 2) ** 2 +
			Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2

		return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
	}

	sortUsersByDistance(
		lat: number,
		lon: number,
		users: { lat: number; lon: number; [key: string]: any }[]
	) {
		try {
			const sorted = users
				.map(user => ({
					...user,
					distance: this.calculateDistance(lat, lon, user.lat, user.lon),
				}))
				.sort((a, b) => a.distance - b.distance)

			return successResponse(sorted, 'Пользователи отсортированы по расстоянию')
		} catch (error) {
			return errorResponse(
				'Ошибка при сортировке пользователей по расстоянию',
				error
			)
		}
	}
}
