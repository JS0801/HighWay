/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/record', 'N/search'],
    /**
 * @param{record} record
 * @param{search} search
 */
    (record, search) => {
        /**
         * Defines the Suitelet script trigger point.
         * @param {Object} scriptContext
         * @param {ServerRequest} scriptContext.request - Incoming request
         * @param {ServerResponse} scriptContext.response - Suitelet response
         * @since 2015.2
         */
        const onRequest = (scriptContext) => {
            try {
                var params = scriptContext.request.parameters;
				var billPaymentId = params.recId;
                var objReturn = {};
                log.debug('billPaymentId', billPaymentId)

                if (billPaymentId) {
                    var billRecs = [];
                    // Get All Apply Ids 
                    var transactionSearchObj = search.create({
                        type: "transaction",
                        filters:
                        [
                            ["internalidnumber","equalto",billPaymentId], 
                            "AND", 
                            ["mainline","is","F"]
                        ],
                        columns:
                        [
                            search.createColumn({name: "appliedtotransaction"})
                        ]
                    });
                    transactionSearchObj.run().each(function(result){
                        var getRecord = result.getValue({
                            name: 'appliedtotransaction'
                        });
                        billRecs.push(getRecord);
                        return true;
                    });


                    var transactionSearchObj = search.create({
                        type: "transaction",
                        filters:
                        [
                            ["internalid","anyof", billRecs], 
                            "AND", 
                            ["mainline","is","T"],
                            "AND",
                            ["applyingtransaction.type","anyof","VendCred"], 
                        ],
                        columns:
                        [
                            search.createColumn({name: "applyingtransaction"}),
                            search.createColumn({
                                name: "trandate",
                                join: "applyingTransaction",
                            }),
                            search.createColumn({
                                name: "tranid",
                                join: "applyingTransaction",
                            }),
                            search.createColumn({
                                name: "amount",
                                join: "applyingTransaction",
                            }),

                        ]
                    });
                  var creditDate = [];
                    transactionSearchObj.run().each(function(result){
                        log.debug("GET RESULT", result);
                        var getRecord = result.getValue({
                            name: 'applyingtransaction'
                        });
                        var recDate = result.getValue({
                            name: "trandate",
                            join: "applyingTransaction",
                        })
                        creditDate.push({
                          date: result.getValue({name: "trandate", join: "applyingTransaction"}),
                          tranid: result.getValue({name: "tranid", join: "applyingTransaction"}),
                          amount: result.getValue({name: "amount", join: "applyingTransaction"}),
                        })
                        return true;
                    });
                    
                }
                log.debug('creditDate', creditDate)
                

                    var strReturn = "<#assign clientData=" + JSON.stringify({obj: creditDate}) + "/>";
                    log.debug("DATA", strReturn);
                    scriptContext.response.writeLine(strReturn);
            }catch(err){
                log.debug("ERROR",err);
            }
        }

        return {onRequest}

    });
