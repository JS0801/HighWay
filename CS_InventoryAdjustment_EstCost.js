/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * Script:      CS_InventoryAdjustment_EstCost.js
 * Description: Automatically populates the Estimated Unit Cost field on
 *              Inventory Adjustment lines with the item's purchase price
 *              (Last Purchase Price > Average Cost > Base Price fallback).
 *
 * Deployment:  Applied to: Inventory Adjustment (record type: inventoryadjustment)
 *              Events used: fieldChanged, lineInit
 */

define(['N/record', 'N/search'], (record, search) => {

    const SUBLIST_ID = 'inventory';       // Inventory Adjustment line sublist
    const ITEM_FIELD  = 'item';           // Item field on the sublist
    const EST_COST_FIELD = 'unitcost';    // Estimated Unit Cost field on the sublist
    const LOCATION_FIELD  = 'location';   // Location field on the sublist
    /**
     * Looks up the best available purchase price for the given item internal ID.
     * Priority: Last Purchase Price → Average Cost → Base Price
     */
    function getPurchasePrice(itemId) {
        if (!itemId) return null;

        const fields = search.lookupFields({
            type: search.Type.ITEM,
            id: itemId,
            columns: ['lastpurchaseprice', 'averagecost', 'baseprice']
        });

        const lastPurchasePrice = parseFloat(fields.lastpurchaseprice) || 0;
        const averageCost       = parseFloat(fields.averagecost)       || 0;
        const basePrice         = parseFloat(fields.baseprice)         || 0;

        // Return first non-zero value in priority order
        return lastPurchasePrice || averageCost || basePrice || null;
    }

    /**
     * Fires when any field on the record changes.
     * When the item field on an inventory line changes, populate Est. Cost.
     */
    function postSourcing(context) {
        try {
            //if (context.sublistId !== SUBLIST_ID || context.fieldId !== ITEM_FIELD) return;
            if (context.sublistId !== SUBLIST_ID || (context.fieldId !== ITEM_FIELD && context.fieldId !==   LOCATION_FIELD)) return;

            const currentRecord = context.currentRecord;
            const itemId = currentRecord.getCurrentSublistValue({
                sublistId: SUBLIST_ID,
                fieldId: ITEM_FIELD
            });

            if (!itemId) return;

            const price = getPurchasePrice(itemId);
            if (price !== null) {
                currentRecord.setCurrentSublistValue({
                    sublistId: SUBLIST_ID,
                    fieldId: EST_COST_FIELD,
                    value: Number(price),
                    ignoreFieldChange: true
                });
            }
        } catch (e) {
            console.error('CS_InventoryAdjustment_EstCost | fieldChanged error: ' + e.message);
        }
    }

    /**
     * Fires when a new line is initialised (optional reinforcement).
     * Useful if item is pre-populated on line creation.
     */
    function lineInit(context) {
        try {
            if (context.sublistId !== SUBLIST_ID) return;

            const currentRecord = context.currentRecord;
            const itemId = currentRecord.getCurrentSublistValue({
                sublistId: SUBLIST_ID,
                fieldId: ITEM_FIELD
            });

            if (!itemId) return;

            const price = getPurchasePrice(itemId);
            if (price !== null) {
                currentRecord.setCurrentSublistValue({
                    sublistId: SUBLIST_ID,
                    fieldId: EST_COST_FIELD,
                    value: price,
                    ignoreFieldChange: true
                });
            }
        } catch (e) {
            console.error('CS_InventoryAdjustment_EstCost | lineInit error: ' + e.message);
        }
    }

    return { postSourcing, lineInit };
});
