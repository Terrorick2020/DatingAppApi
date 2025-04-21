import { Injectable } from '@nestjs/common'
import axios from 'axios'

@Injectable()
export class GeoService {
	private readonly yandexApiKey = process.env.YANDEX_API_KEY

	async getCityByCoordinates(lat: number, lon: number): Promise<string> {
		const response = await axios.get(
			`https://geocode-maps.yandex.ru/1.x/`, {
				params: {
					apikey: this.yandexApiKey,
					format: 'json',
					geocode: `${lon},${lat}`,
					lang: 'ru_RU',
					results: 1,
				}
			}
		)

		const geoObject =
			response.data.response.GeoObjectCollection.featureMember?.[0]?.GeoObject

		return geoObject?.metaDataProperty?.GeocoderMetaData?.Address?.Components
			?.find((c: any) => c.kind === 'locality')?.name || 'Unknown'
	}

	calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
		const toRad = (x: number) => (x * Math.PI) / 180
		const R = 6371

		const dLat = toRad(lat2 - lat1)
		const dLon = toRad(lon2 - lon1)

		const a =
			Math.sin(dLat / 2) ** 2 +
			Math.cos(toRad(lat1)) *
				Math.cos(toRad(lat2)) *
				Math.sin(dLon / 2) ** 2

		return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
	}

	sortUsersByDistance(lat: number, lon: number, users: any[]) {
		return users
			.map(user => ({
				...user,
				distance: this.calculateDistance(lat, lon, user.lat, user.lon),
			}))
			.sort((a, b) => a.distance - b.distance)
	}
}
