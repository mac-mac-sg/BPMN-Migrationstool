// Adapter for the original artifact API. All data stays in this browser.
window.storage = window.storage || {
  async get(key) { const value = localStorage.getItem(key); return value === null ? null : {key,value}; },
  async set(key,value) { localStorage.setItem(key,value); return {key,value}; },
  async delete(key) { localStorage.removeItem(key); return {key,deleted:true}; }
};
