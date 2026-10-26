import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/**
 * Validates that a string is a valid HTTP or HTTPS URL.
 * Strictly rejects other protocols (ftp, file, javascript, data, etc.)
 * and malformed URLs.
 */
export function IsValidMonitorUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidMonitorUrl',
      target: object.constructor,
      propertyName: propertyName,
      options: {
        message: 'URL must be a valid HTTP or HTTPS URL (e.g., https://api.example.com/health)',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown, _args: ValidationArguments) {
          if (typeof value !== 'string') {
            return false;
          }
          const trimmed = value.trim();
          if (!trimmed) {
            return false;
          }
          try {
            const parsed = new URL(trimmed);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
              return false;
            }
            if (!parsed.hostname || parsed.hostname.length === 0) {
              return false;
            }
            return true;
          } catch {
            return false;
          }
        },
      },
    });
  };
}
