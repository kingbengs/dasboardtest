const ConstantsProxy = requireRoot('/lib/meta/constants-proxy');

module.exports = ConstantsProxy({
  business: {
    dbKey: 'v2business',
    hubspotKey: 'job_industry',
  },
  department: {
    dbKey: 'v2department',
    hubspotKey: 'job_field',
  },
  role: {
    dbKey: 'v2departmentrole',
    hubspotKey: 'job_role',
    hubspotOtherKey: 'job_role_other',
  },
  employees: {
    dbKey: 'v2employees',
    hubspotKey: 'numemployees',
  },
});
