async function main() {
  const targets = await (await fetch('http://127.0.0.1:9223/json')).json();
  const page = targets.find((x) => x.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0;
  let errors = [];
  let network = [];
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) errors.push({ type: message.params.type, text: (message.params.args || []).map(x => x.value || x.description || '').join(' ').slice(0, 300) });
    if (message.method === 'Runtime.exceptionThrown') errors.push({ type: 'exception', text: message.params.exceptionDetails.text, className: message.params.exceptionDetails.exception?.className });
    if (message.method === 'Network.requestWillBeSent') network.push({ id: message.params.requestId, url: new URL(message.params.request.url).pathname, status: null, failed: null });
    if (message.method === 'Network.responseReceived') { const item = network.find(x => x.id === message.params.requestId); if (item) item.status = message.params.response.status; }
    if (message.method === 'Network.loadingFailed') { const item = network.find(x => x.id === message.params.requestId); if (item) item.failed = message.params.errorText; }
    if (message.id === 5) {
      console.log(JSON.stringify({ errors, network: network.map(({id,...item})=>item), page: message.result?.result?.value }, null, 2));
      ws.close();
    }
  });
  ws.send(JSON.stringify({ id: ++id, method: 'Runtime.enable', params: {} }));
  await new Promise(resolve => setTimeout(resolve, 300));
  ws.send(JSON.stringify({ id: ++id, method: 'Network.enable', params: {} }));
  ws.send(JSON.stringify({ id: ++id, method: 'Page.enable', params: {} }));
  await new Promise(resolve => setTimeout(resolve, 300));
  ws.send(JSON.stringify({ id: ++id, method: 'Page.navigate', params: { url: 'http://localhost:5173/signup' } }));
  await new Promise(resolve => setTimeout(resolve, 3000));
  ws.send(JSON.stringify({ id: ++id, method: 'Runtime.evaluate', params: { expression: 'JSON.stringify({url:location.origin+location.pathname,title:document.title,body:document.body.innerText.slice(0,500),inputCount:document.querySelectorAll("input").length,scriptSources:[...document.scripts].map(x=>x.src).filter(Boolean)})', returnByValue: true } }));
}
main().catch(() => { console.error('Chrome diagnostic failed.'); process.exitCode = 1; });
