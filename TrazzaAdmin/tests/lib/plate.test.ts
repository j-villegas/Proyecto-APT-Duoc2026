import { describe, expect, it } from 'vitest'
import { formatPlate } from '@/app/components/Plate'

describe('formatPlate', () => {
  it.each([
    ['GY-BY-99', 'GY·BY·99'],
    ['gyby99', 'GY·BY·99'],
    ['tb cc 32', 'TB·CC·32'],
    ['AB1234', 'AB·12·34'],
    ['XYZ', 'XYZ'],
  ])('%s -> %s', (input, expected) => {
    expect(formatPlate(input)).toBe(expected)
  })
})
