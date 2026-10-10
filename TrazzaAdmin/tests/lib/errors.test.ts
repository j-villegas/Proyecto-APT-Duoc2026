import { describe, expect, it } from 'vitest'
import { friendlyError, friendlyReason } from '@/lib/errors'

describe('friendlyReason', () => {
  it('traduce restricciones únicas conocidas por su nombre', () => {
    expect(friendlyReason({
      code: '23505',
      message: 'duplicate key value violates unique constraint "vehicles_unique_plate_per_company"',
    })).toBe('Ya existe un vehículo con esa patente. Búscalo en el inventario o revisa si la escribiste bien.')
  })

  it('usa un mensaje genérico para restricciones únicas desconocidas', () => {
    expect(friendlyReason({ code: '23505', message: 'duplicate key value violates unique constraint "otra"' }))
      .toBe('Ya existe un registro con esos datos.')
  })

  it('traduce restricciones check', () => {
    expect(friendlyReason({ code: '23514', message: 'new row violates check constraint "vehicles_year_check"' }))
      .toBe('El año del vehículo debe estar entre 1980 y 2100.')
  })

  it.each([
    [{ name: 'TypeError', message: 'Failed to fetch' }, 'Sin conexión con el servidor'],
    [{ code: 'PGRST301', message: 'JWT expired' }, 'Tu sesión expiró'],
    [{ code: '42501', message: 'new row violates row-level security policy for table "vehicles"' }, 'No tienes permiso'],
    [{ code: '23503', message: 'update or delete on table "passengers" violates foreign key constraint' }, 'No se puede eliminar'],
    [{ code: '23502', message: 'null value in column "plate"' }, 'Falta completar'],
    [{ code: 'PGRST202', message: 'Could not find the function public.admin_start_service' }, 'falta actualizar la base de datos'],
  ])('%j', (error, fragment) => {
    expect(friendlyReason(error)).toContain(fragment)
  })

  it('deja pasar los mensajes de las funciones SQL (P0001)', () => {
    expect(friendlyReason({ code: 'P0001', message: 'Este servicio ya está en curso.' })).toBe('Este servicio ya está en curso.')
  })

  it('nunca expone mensajes técnicos desconocidos', () => {
    const reason = friendlyReason({ code: 'XX000', message: 'relation "foo" does not exist' })
    expect(reason).not.toMatch(/relation|foo|XX000/)
  })
})

describe('friendlyError', () => {
  it('antepone la acción que se intentaba', () => {
    expect(friendlyError({ code: '23502', message: 'x' }, 'No se pudo guardar')).toBe('No se pudo guardar. Falta completar un campo obligatorio.')
  })
})
