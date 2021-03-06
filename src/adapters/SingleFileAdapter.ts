import Adapter from "./Adapter";
import { MalformedSourceFileError, IOError, JabTableNotFoundError } from "../errors";

import { Database, Table } from "../model";

import fs, { readFile, writeFile } from "fs";
import util from "util";
import _ from "lodash";

/**
 * An adapter for JabDB that uses a single file as the source,
 * and uses aync methods
 * @extends Adapter
 */
export class SingleFileAdapter extends Adapter {
    private source: string;
    private requireJSONFile: boolean;

    /**
     * Creates an instance of SingleFileAdapter.
     * @param {string} source The path of the source file
     * @param {boolean} requireJSONFile Whether to require the file to
     * be a .json file (``true`` by default)
     */
    constructor(source: string, requireJSONFile: boolean = true) {
        super();

        this.source = source;
        this.requireJSONFile;
    }

    /** @inheritdoc */
    public async connect(): Promise<void> {
        return new Promise(async (resolve, reject) => {

            // Check if source exists
            if (fs.existsSync(this.source)) {

                // Check source
                this.checkSource()
                    .then(() => {
                        util.promisify(readFile)(this.source)
                            .then(data => {
                                const database = JSON.parse(data.toString());

                                if (Database.isDatabase(database)) {
                                    resolve();
                                } else {
                                    reject(new MalformedSourceFileError("Invalid source file, missing 'tables' or 'meta' field"));
                                }
                            })
                            .catch(reject);
                    })
                    .catch(reject);

            } else {
                util.promisify(fs.writeFile)(this.source, JSON.stringify({ meta: {}, tables: [] }))
                    .then(resolve)
                    .catch(reject);
            }
        });
    }


    /**
     * Checks that the source file exists, and is a .json file
     * @private
     * @returns {Promise<boolean>}
     * @memberof SingleFileAdapter
     */
    private async checkSource(): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {

            if (this.requireJSONFile && !this.source.endsWith(".json")) {
                reject(new MalformedSourceFileError("Source file is not a '.json' file!"));
            }

            if (fs.existsSync(this.source)) {
                util.promisify(fs.stat)(this.source).then(stats => {
                    if (!stats.isFile()) {
                        reject(new IOError("Source '" + this.source + "' is not a file!"));
                    }
                    resolve(true);
                }).catch(reject);
            } else {
                reject(new IOError("Source '" + this.source + "' does not exist!"));
            }
        });
    }

    /**
     * Reads the source file and returns the data as a {@link Database} object
     */
    private async readSource(): Promise<Database> {
        return new Promise<any>((resolve, reject) => {
            this.checkSource().then(async () => {
                const data = JSON.parse((await util.promisify(readFile)(this.source)).toString());

                if (Database.isDatabase(data)) resolve(data);
                else reject(new MalformedSourceFileError("Invalid source file, missing 'tables' or 'meta' field"));

            }).catch(err => {
                reject(err);
            });
        });
    }

    /**
     * Writes data to the source file
     * @param database The data to write as a {@link Database} object
     */
    private async writeSource(database: Database): Promise<void> {
        return new Promise((resolve, reject) => {

            // Convert the dictionaries to a plain object, so that JSON.stringify works
            _.forEach(database.tables, (table) => {
                table.entries = _.toPlainObject(table.entries);
            });
            database.tables = _.toPlainObject(database.tables);

            const json = JSON.stringify(database);

            util.promisify(writeFile)(this.source, json, { flag: "w" })
                .then(resolve)
                .catch(reject);
        });
    }


    /**
     * Get a table from the database source
     * @param id The id of the table to get
     * @returns {Promise<Table>} The table as a {@link Table} object.
     */
    public async getTable(id: string): Promise<Table> {
        const data = await this.readSource();

        return new Promise((resolve, reject) => {
            const table = _.get(data.tables, id) as Table;
            if (table) resolve(table);
            else reject(new JabTableNotFoundError(id));
        });
    }

    /**
     * Save a table to the database. If a table with the same id exists, it will be overridden.
     * @param table The table to save in the database.
     */
    public async saveTable(table: Table): Promise<void> {
        return new Promise(async (resolve, reject) => {
            const data = await this.readSource();

            _.set(data.tables, table.name, table);

            this.writeSource(data)
                .then(resolve)
                .catch(reject);
        });
    }

    public async deleteTable(id: string): Promise<void> {
        return new Promise(async (resolve, reject) => {
            const data = await this.readSource();

            if (_.has(data.tables, id)) {
                _.unset(data.tables, id);

                this.writeSource(data)
                    .then(resolve)
                    .catch(reject);
            } else {
                reject(new JabTableNotFoundError(id));
            }

        });
    }
}