import {
	registerDecorator,
	ValidationOptions,
	ValidationArguments,
	ValidatorConstraint,
	ValidatorConstraintInterface,
} from 'class-validator'

@ValidatorConstraint({ name: 'isGeoDataValid', async: false })
export class IsGeoDataValidConstraint implements ValidatorConstraintInterface {
	validate(value: any, args: ValidationArguments) {
		const object = args.object as any

		// Если включена геолокация, координаты обязательны
		if (object.enableGeo === true) {
			return (
				object.latitude !== undefined &&
				object.latitude !== null &&
				object.longitude !== undefined &&
				object.longitude !== null
			)
		}

		// Если геолокация выключена, координаты не обязательны
		return true
	}

	defaultMessage(args: ValidationArguments) {
		return 'При включенной геолокации координаты (latitude, longitude) обязательны'
	}
}

export function IsGeoDataValid(validationOptions?: ValidationOptions) {
	return function (object: Object, propertyName: string) {
		registerDecorator({
			target: object.constructor,
			propertyName: propertyName,
			options: validationOptions,
			constraints: [],
			validator: IsGeoDataValidConstraint,
		})
	}
}
