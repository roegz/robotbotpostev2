const JSON_HEADERS = { 'Content-Type': 'application/json' };

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? JSON_HEADERS : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Impossible de joindre le serveur. Vérifie ta connexion.', 0);
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      window.dispatchEvent(new Event('rbp:unauthorized'));
    }
    throw new ApiError(data?.error || `Erreur ${response.status}`, response.status);
  }

  return data;
}

export const get = (path) => request(path);
export const post = (path, body = {}) => request(path, { method: 'POST', body });
export const patch = (path, body = {}) => request(path, { method: 'PATCH', body });
export const del = (path) => request(path, { method: 'DELETE' });

/** Upload avec barre de progression (XMLHttpRequest). */
export function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.withCredentials = true;

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total);
      }
    });

    xhr.addEventListener('load', () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        if (xhr.status === 401) {
          window.dispatchEvent(new Event('rbp:unauthorized'));
        }
        reject(new ApiError(data?.error || `Erreur ${xhr.status}`, xhr.status));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new ApiError('Envoi impossible. Vérifie ta connexion.', 0));
    });

    xhr.send(form);
  });
}
