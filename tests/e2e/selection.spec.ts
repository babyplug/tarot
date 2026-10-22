import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const pickers = (page: Page) => page.locator('.deck-card:not(.chosen)');
test('manual selection survives pagination and refresh, then completes the same spread', async ({ page }) => {
  await page.goto('/preview');
  await page.getByRole('button', { name: 'Shuffle & choose' }).click();
  await pickers(page).nth(3).click();
  await expect(page.locator('.spread-position.revealed')).toHaveCount(1);
  const first = await page.locator('.spread-position.revealed strong').textContent();
  await page.getByRole('button', { name: 'Next', exact: false }).click();
  await pickers(page).first().click();
  await expect(page.locator('.spread-position.revealed')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.spread-position.revealed')).toHaveCount(2);
  await expect(page.locator('.spread-position.revealed strong').first()).toHaveText(first!);
  await page.getByRole('button', { name: 'Draw remaining automatically' }).click();
  await expect(page.locator('.spread-position.revealed')).toHaveCount(3);
  await page.getByRole('button', { name: 'Read my cards' }).click();
  await expect(page.getByRole('textbox', { name: 'Copy spread' })).toContainText('Please interpret this completed tarot spread');
  await expect(page.getByRole('textbox', { name: 'Copy spread' })).toContainText(first!);
  await expect(page.locator('.deck-grid')).toHaveCount(0);
});

for (const [name, count] of [['One card', 1], ['Two cards', 2], ['Three cards', 3], ['Horseshoe', 7]] as const) {
  test(`${name} automatic draw has the correct number of unique cards`, async ({ page }) => {
    await page.goto('/preview'); await page.getByRole('radio', { name: new RegExp(name) }).check();
    await page.getByRole('switch').check();
    await page.getByRole('button', { name: 'Shuffle & choose' }).click();
    await page.getByRole('button', { name: 'Draw remaining automatically' }).click();
    await expect(page.locator('.spread-position.revealed')).toHaveCount(count);
    const names = await page.locator('.spread-position.revealed strong').allTextContents();
    expect(new Set(names).size).toBe(count);
    await expect(page.getByRole('button', { name: 'Read my cards' })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('a lost response retries the same draw without consuming another card', async ({ page }) => {
  await page.goto('/preview'); await page.getByRole('button', { name: 'Shuffle & choose' }).click();
  let lost = false;
  await page.route('**/api/tool', async route => {
    const input = route.request().postDataJSON();
    if (input.name === 'select_card' && !lost) {
      lost = true; await route.fetch(); await route.abort('failed');
    } else await route.continue();
  });
  await pickers(page).first().click();
  await expect(page.getByRole('button', { name: 'Retry action' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry action' }).click();
  await expect(page.locator('.spread-position.revealed')).toHaveCount(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('new reading confirmation keeps or discards the current spread explicitly', async ({ page }) => {
  await page.goto('/preview'); await page.getByRole('button', { name: 'Shuffle & choose' }).click();
  await pickers(page).first().click(); await expect(page.locator('.spread-position.revealed')).toHaveCount(1);
  await page.getByRole('button', { name: 'New reading' }).click();
  await page.getByRole('button', { name: 'Keep these cards' }).click();
  await expect(page.locator('.spread-position.revealed')).toHaveCount(1);
  await page.getByRole('button', { name: 'New reading' }).click();
  await page.getByRole('button', { name: 'Start fresh' }).click();
  await expect(page.getByRole('button', { name: 'Shuffle & choose' })).toBeVisible();
});

test('Thai controls and keyboard card selection work with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/preview');
  await page.getByLabel('Language / ภาษา').selectOption('th');
  await page.getByRole('button', { name: 'สับไพ่แล้วเลือก' }).click();
  const card = pickers(page).first(); await card.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.spread-position.revealed')).toHaveCount(1);
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
});

test('MCP Apps host receives the completed cards through context and an actual message', async ({ page }) => {
  const widgetHtml = await readFile('dist/widget.html', 'utf8');
  await page.route('**/host-test', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body><iframe title="Tarot widget" src="/widget-test" style="width:100%;height:1400px;border:0"></iframe><script>
    window.received = [];
    addEventListener('message', async event => {
      const m = event.data; if (!m || m.jsonrpc !== '2.0') return;
      const reply = result => event.source.postMessage({ jsonrpc:'2.0', id:m.id, result }, '*');
      if (m.method === 'ui/initialize') reply({ protocolVersion:m.params.protocolVersion, hostInfo:{name:'test-host',version:'1'}, hostCapabilities:{serverTools:{},message:{text:{}},updateModelContext:{text:{}}}, hostContext:{theme:'light',displayMode:'inline'} });
      if (m.method === 'ui/notifications/initialized') event.source.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{content:[],structuredContent:{locale:'en'},_meta:{widgetId:'host-test-widget'}}},'*');
      if (m.method === 'tools/call') reply(await (await fetch('/api/tool',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:m.params.name,arguments:m.params.arguments})})).json());
      if (m.method === 'ui/message' || m.method === 'ui/update-model-context') { window.received.push(m); reply({}); }
    });
  </script></body></html>` }));
  await page.route('**/widget-test', route => route.fulfill({ contentType: 'text/html', body: widgetHtml }));
  await page.goto('/host-test');
  const widget = page.frameLocator('iframe');
  await widget.getByRole('button', { name: 'Shuffle & choose' }).click();
  await widget.getByRole('button', { name: 'Draw remaining automatically' }).click();
  await widget.getByRole('button', { name: 'Read my cards' }).click();
  await expect(widget.getByRole('button', { name: 'Reading sent to ChatGPT' })).toBeVisible();
  const messages = await page.evaluate(() => (window as unknown as { received: { method: string; params: { content?: { text: string }[]; structuredContent?: { reading: { cards: unknown[] } } } }[] }).received);
  expect(messages.find(m => m.method === 'ui/message')?.params.content?.[0]?.text).toContain('Please interpret this completed tarot spread');
  expect(messages.find(m => m.method === 'ui/update-model-context')?.params.structuredContent?.reading.cards).toHaveLength(3);
  expect(JSON.stringify(messages)).not.toContain('accessToken');
});
