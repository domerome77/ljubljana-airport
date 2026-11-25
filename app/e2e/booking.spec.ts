import { expect, test } from '@playwright/test';

test('passenger books Bled for 2 in demo mode and admin sees the booking', async ({ page }) => {
  page.on('pageerror', (e) => { throw e; });
  await page.goto('./');
  await page.getByLabel('To').selectOption('LJU-BLED');
  await page.getByLabel('Passengers').selectOption('2');
  const first = page.locator('button.dep[aria-pressed="true"]');
  await expect(first).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Full name').fill('E2E Traveller');
  await page.getByLabel('Email').fill('e2e@example.com');
  await page.getByLabel('I accept the terms of carriage').check();
  await page.getByRole('button', { name: /^Pay .* with Revolut$/ }).click();
  await page.getByRole('button', { name: /\(test\)$/ }).click();
  await expect(page.getByRole('heading', { name: "You're booked!" })).toBeVisible();
  await expect(page.locator('.conf-plate')).toHaveText(/^LJ-/);
  const ref = (await page.locator('.conf-ref').first().textContent())!.trim();

  await page.goto('./#/admin/bookings');
  await page.getByLabel('Email').fill('admin@demo');
  await page.getByLabel('Password').fill('demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(ref)).toBeVisible();
});

test('no horizontal scroll on the landing page', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Airport transfers' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
