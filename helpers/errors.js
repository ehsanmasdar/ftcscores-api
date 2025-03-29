const schema = require('./validate');
module.exports.form = function(_errors) {
  var errors = { };
  for (var i in _errors) {
    errors[_errors[i].field.replace(".","-")] = schema.getErrorMessage(_errors[i].field) || _errors[i].messages[0].replace(/"/g, "").replace(/'/g, "")  || "Invalid value";
  }
  return errors;
}
