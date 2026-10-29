const { getCollegesWithDepartments } = require('./backend/controllers/adminController');

(async () => {
  const res = {
    status(code) {
      return {
        json(payload) {
          console.log('STATUS=' + code);
          console.log(JSON.stringify(payload));
          return payload;
        },
      };
    },
    json(payload) {
      console.log('STATUS=200');
      console.log(JSON.stringify(payload));
      return payload;
    },
  };

  await getCollegesWithDepartments({}, res);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
