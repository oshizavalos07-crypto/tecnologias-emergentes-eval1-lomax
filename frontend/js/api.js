const API_BASE = '/api';

async function apiGet(ruta) {
  const res = await fetch(`${API_BASE}${ruta}`);
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, ...datos };
  return datos;
}

async function apiPostJSON(ruta, cuerpo) {
  const res = await fetch(`${API_BASE}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, ...datos };
  return datos;
}

async function apiPostForm(ruta, formData) {
  const res = await fetch(`${API_BASE}${ruta}`, { method: 'POST', body: formData });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, ...datos };
  return datos;
}
