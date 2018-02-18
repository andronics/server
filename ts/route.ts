import * as KoaRouter from 'koa-router'

// =============================================

import { IRouterContext, IRouterOptions } from 'koa-router'

// =============================================

export class HttpRoute {

    protected title: string
    private scripts: string[]
    private styles: string[]

    public static create(router: KoaRouter): void {

    }

    constructor() {

        // initialize variables
        this.title = "Default Route Title"
        this.scripts = []

    }

    public addScripts(src: string): Route {

        // push scripts to array
        this.scripts.push(src)
        return this

    }

    public addStyle(src: string): Route {

        // push styles to array
        this.styles.push(src)
        return this

    }

    public render(ctx: IRouterContext, view: string, options?: IRouterOptions): void {

        // add title
        ctx.state.title = this.title

        // add styles & scripts
        ctx.state.scripts = this.scripts
        ctx.state.styles = this.styles

        // add constants
        ctx.state.BASE_URL = '/'

        // render view
        ctx.render(view, options)

    }

}