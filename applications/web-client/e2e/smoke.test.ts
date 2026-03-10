import {test, expect} from '@playwright/test'

test('renders the app heading', async ({page}) => {
  await page.goto('/battleship/')
  await expect(page.getByRole('heading', {name: 'Battleship'})).toBeVisible()
})
