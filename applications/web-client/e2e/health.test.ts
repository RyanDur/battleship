import {test, expect} from '@playwright/test'

test('shows service online when backend is running', async ({page}) => {
  await page.goto('/battleship/')
  await expect(page.getByText('Service online')).toBeVisible()
})

test('shows no update prompt when version matches', async ({page}) => {
  await page.goto('/battleship/')
  await expect(page.getByText('Update available')).not.toBeVisible()
})
