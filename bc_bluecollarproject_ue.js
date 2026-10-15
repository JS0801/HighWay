/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/record', 'N/runtime', 'N/search'],
    /**
 * @param{record} record
 * @param{runtime} runtime
 * @param{search} search
 */
    (record, runtime, search) => {
        /**
         * Defines the function definition that is executed before record is loaded.
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
         * @param {Form} scriptContext.form - Current form
         * @param {ServletRequest} scriptContext.request - HTTP request information sent from the browser for a client action only.
         * @since 2015.2
         */
        const beforeLoad = (scriptContext) => {
            try{
                if(scriptContext.type == 'view'){
                    var currentForm = scriptContext.form;
                    var currentRecord = scriptContext.newRecord;

                    var currentUserObj = runtime.getCurrentUser();
                    var currentUserRoleId = currentUserObj.role;
                    log.debug('currentUserRoleId', currentUserRoleId);

                    var roleCanCreatePurchaseOrder = false;
                    var roleCanCreateInvoice = false;

                    var currentRecordId = currentRecord.getValue({fieldId: 'id'});

                    //if not Administrator
                    if(currentUserRoleId != 3){
                        const roleSearchObj = search.create({
                            type: "role",
                            filters:
                            [
                                ["internalid","anyof",currentUserRoleId], 
                                "AND", 
                                ["permission","anyof","TRAN_CUSTINVC","TRAN_PURCHORD"]
                            ],
                            columns:
                            [
                                search.createColumn({name: "permission", label: "Permission"}),
                                search.createColumn({name: "level", label: "Level"})
                            ]
                        });
                        
                        roleSearchObj.run().each(function(result){
                            var permission = result.getValue({name: "permission", label: "Permission"});
                            var permissionLevel = result.getValue({name: "level", label: "Level"});

                            if(permission == 'TRAN_PURCHORD' && (permissionLevel == 2 || permissionLevel == 3 || permissionLevel == 4)){
                                roleCanCreatePurchaseOrder = true
                            }
                            else if(permission == 'TRAN_CUSTINVC' && (permissionLevel == 2 || permissionLevel == 3 || permissionLevel == 4)){
                                roleCanCreateInvoice = true
                            }

                            //return true;
                        });
                    }

                    if(currentUserRoleId == 3 || roleCanCreatePurchaseOrder == true){                        
                        log.debug('Add Button', 'Create Purchase Order');

                        currentForm.addButton({
                            id: 'custpage_createpurchaseorder',
                            label: 'Create Purchase Order',
                            functionName: 'createPurchaseOrder(' + currentRecordId + ')'
                        });
                    }   

                    if(currentUserRoleId == 3 || roleCanCreateInvoice == true){
                        log.debug('Add Button', 'Create Invoice');

                        currentForm.addButton({
                            id: 'custpage_createinvoice',
                            label: 'Create Invoice',
                            functionName: 'createInvoice(' + currentRecordId + ')'
                        });
                    }                    

                    scriptContext.form.clientScriptModulePath = './bc_bluecollarproject_cs.js';
                }
            }
            catch (e){
                log.debug('beforeLoad error', e);
            }
        }

        /**
         * Defines the function definition that is executed before record is submitted.
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {Record} scriptContext.oldRecord - Old record
         * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
         * @since 2015.2
         */
        const beforeSubmit = (scriptContext) => {

        }

        /**
         * Defines the function definition that is executed after record is submitted.
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {Record} scriptContext.oldRecord - Old record
         * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
         * @since 2015.2
         */
        const afterSubmit = (scriptContext) => {
            
        }

        return {
            beforeLoad, 
            //beforeSubmit, 
            //afterSubmit
        }

    });
