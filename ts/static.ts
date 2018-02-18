import * as _ from 'lodash'
import * as koaMount from 'koa-mount'
import * as koaStatic from 'koa-static'
import * as path from 'path'

// =============================================

export class HttpStatic {

    protected options: object
    protected path: string
    protected server: any

    constructor(koaServer, options) {

        this.options = _.defaults(options || {
            defer: false
        })

        if (!this.options.mount) {
            throw new Error("options.mount attr required")
        }

        this.server = koaServer
        this.path = path.resolve(process.cwd(), this.options.path)

        this.server.use(
            koaMount( this.options.mount, koaStatic(this.path, this.options) )
        )

    }

}