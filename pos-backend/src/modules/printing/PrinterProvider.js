class PrinterProvider {
  /**
   * @param {{title?:string, meta?:Array<[string,string]>, lines?:Array<{qty:number,name:string,note?:string}>, footer?:string}} payload
   * @param {object} config - the relevant settings.printing.{kot|receipt} sub-object
   * @returns {Promise<{printed:boolean, payload?:object}>}
   */
  // eslint-disable-next-line no-unused-vars
  async print(payload, config) {
    throw new Error('Not implemented');
  }
}

module.exports = PrinterProvider;
