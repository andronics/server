import * as _ from 'lodash'
import * as KoaRouter from 'koa-router'
import * as stable from 'stable'
import { IRouterOptions } from 'koa-router';

// =============================================

let BUILTIN_MIDDLEWARE = {builtin: true}

// =============================================

export class HttpRouter extends KoaRouter {

    protected phases: string[] = [
        'initial', 'session', 'auth', 'parse', 'routing', 'static', 'final'
    ]

    protected skipSorting: boolean = false

    private $lazyRouter: Function
    private $use: Function

    constructor(options?: IRouterOptions) {
        super(options)
        this.$use = super.use
        this.$lazyRouter = this.lazyRouter
    }

    public addPhase() {}

    private findByHandler(handler) {
        
        let layers = this.stack
        for(let i = layers.length -1; i >= 0; i--) {

            if (layers[i].stack.indexOf(handler) === -1) {

                // console.log("found at layer %s", i)
                return layers[i]

            } else {

                let sublayers = layers[i].stack
                for(let p in sublayers) {

                    if(sublayers[p] === handler) {

                        // console.log("found at layer %s sublayer %s", i, p)
                        return layers[i]

                    }

                }

            }

        }

        return null

    }

    private lazyRouter() {

        let self = this

        if (self.router) return

        self.$lazyRouter()

        let router = self.router

        router.stack.forEach(layer => layer.phase = BUILTIN_MIDDLEWARE)

        router.$koaUse = router.use
        router.use = (...args): koaRouter => {
            let router: koaRouter = this.$koaUse.apply(this, args)
            self.sortByPhase()
            return router
    
        }

        router.$koaRoute = router.route
        router.use = (...args): koaRouter => {
            let router: koaRouter = this.$koaRoute.apply(this, args)
            self.sortByPhase()
            return router
        }

    }

    private sortByPhase(): void {

        if (this.skipSorting) return

        let order = {}
        this.phases.forEach((name, idx) => {
            order[name + ':before'] = idx * 3
            order[name] = idx * 3 + 1
            order[name + ':after'] = idx * 3 + 2
        })

        function compare(left, right) {
            
            if (left.phase === right.phase) return 0

            // default to routing layer
            if (left.phase === undefined) {
                if (right.phase === 'routing') return -1
                return order['routing'] - order[right.phase]
            }

            if (right.phase === undefined)
                return -compare(right, left)

            return order[left.phase] - order[right.phase]

        }

        stable.inplace(this.stack, compare)

    }

    public use(name, paths, handler): HttpRouter {

        if (handler === undefined && typeof paths === 'function') {
            handler = paths
            paths = undefined
        }

        if (paths === undefined) {
            paths = '/'
        }

        let phaseName = name
        let handlerName = handler.name || '<anonymouse>'

        let match = name.match(/^(.+):(before|after)$/)
        if (match) {
            name = match[1]
        }

        if (this.phases.indexOf(name) === -1)
            throw new Error("Unknown middleware phase " + name)
        
        // console.log('use %s %s %s', phaseName, paths, handlerName)

        this.skipSorting = true

        this.$use(paths, handler)

        let layer = this.findByHandler(handler)
        if (layer)
            layer.phase = phaseName
        else
            console.log('No matching layer is found for %s %s', phaseName, handlerName)

        this.skipSorting = false

        this.sortByPhase()

        return this

    }


}