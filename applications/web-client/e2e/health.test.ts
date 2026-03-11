import {test, expect} from '@playwright/test'

test('shows service online when backend is running', async ({page}) => {
  await page.goto('/battleship/')
  await expect(page.getByText('Service online')).toBeVisible({timeout: 10_000})
})

test('shows no update prompt when version matches', async ({page}) => {
  await page.goto('/battleship/')
  await expect(page.getByText('Service online')).toBeVisible({timeout: 10_000})
  await expect(page.getByText('Update available')).not.toBeVisible()
})

test('hides download link when service is running and up to date', async ({page}) => {
  await page.goto('/battleship/')
  await expect(page.getByText('Service online')).toBeVisible({timeout: 10_000})
  await expect(page.getByRole('link', {name: /download|upgrade/i})).not.toBeVisible()
})
