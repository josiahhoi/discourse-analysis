/** Localize the existing Electron menu; retain its roles, actions and shortcuts. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createNativeMenuTranslator(Menu, appName) {
  const context = { window: {} };
  vm.createContext(context);
  for (const name of ['en', 'zh-CN', 'zh-Hant']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, name + '.js'), 'utf8'), context);
  }
  const catalogs = context.window.DA_I18N_CATALOGS;
  let original;
  function snapshot(menu) {
    return menu.items.map(item => ({
      label: item.label, type: item.type, role: item.role || undefined,
      accelerator: item.accelerator || undefined,
      enabled: item.enabled, visible: item.visible, checked: item.checked,
      click: item.role ? undefined : item.click,
      ...(item.submenu ? { submenu: snapshot(item.submenu) } : {})
    }));
  }
  return function update(locale) {
    if (!['en', 'zh-CN', 'zh-Hant'].includes(locale)) return false;
    if (!original) {
      const menu = Menu.getApplicationMenu();
      if (!menu) return false;
      original = snapshot(menu);
    }
    function translate(items) {
      return items.map(item => {
        const key = 'native.' + item.role;
        // Unknown OS items and product names retain their original labels.
        const label = locale === 'en' ? item.label : catalogs[locale][key] || catalogs.en[key] || item.label;
        return { ...item, label: label.replace(/\{app\}/g, appName),
          ...(item.submenu ? { submenu: translate(item.submenu) } : {}) };
      });
    }
    Menu.setApplicationMenu(Menu.buildFromTemplate(translate(original)));
    return true;
  };
}
module.exports = { createNativeMenuTranslator };
