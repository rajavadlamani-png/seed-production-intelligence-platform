/* Prototype-only configurable template metadata. No server persistence or real farmer data. */
const TEMPLATE_CONFIG = {
 pilot:{crop:"Paddy",state:"Telangana",district:"Karimnagar",season:"Rabi 2026–27",expectedStart:"November 2026"},
 stages:[
 {key:"first-inspection",label:"First Inspection Report",crop:"Paddy"},
 {key:"vegetative",label:"Vegetative Report",crop:"Paddy"},
 {key:"pre-flowering",label:"Pre Flowering Report",crop:"Paddy"},
 {key:"flowering",label:"Flowering Report",crop:"Paddy"},
 {key:"pre-harvesting",label:"Pre Harvesting Report",crop:"Paddy"},
 {key:"harvesting",label:"Harvesting Report",crop:"Paddy"}],
 lifecycle:["Draft","Preview/Test","Submitted for Approval","Approved/Scheduled","Active","Retired"],
 designations:[
 {id:"designation-tfa",title:"Temporary Field Assistant",aliases:["TFA"],roleKey:"",mappingStatus:"Unmapped"},
 {id:"designation-field-officer",title:"Field Officer",aliases:[],roleKey:"",mappingStatus:"Unmapped"},
 {id:"designation-production-officer",title:"Production Officer",aliases:[],roleKey:"",mappingStatus:"Unmapped"},
 {id:"designation-tpl",title:"Territory Production Lead",aliases:["TPL"],roleKey:"",mappingStatus:"Unmapped"}]
};