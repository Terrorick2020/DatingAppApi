import { ApiResponse } from '../interfaces/api-response.interface';

export const successResponse = <T>(data: T, message = 'OK', meta?: any): ApiResponse<T> => ({
  success: true,
  message,
  data,
  meta,
});

export const errorResponse = (message: string, errors?: any): ApiResponse => ({
  success: false,
  message,
  errors,
});
