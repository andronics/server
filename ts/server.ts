import koaCookie from 'koa-cookie'

import * as Koa from 'koa'
import * as koaBodyParser from 'koa-bodyparser'
import * as koaBetterErrorHandler from 'koa-better-error-handler'
import * as koaCompress from 'koa-compress'
import * as koaJson from 'koa-json'
import * as koaJwt from 'koa-jwt'
import * as koaLivereload from 'koa-livereload'
import * as koaLogger from 'koa-logger'
import * as koaMount from 'koa-mount'
import * as koaRateLimit from 'koa-ratelimit'
import * as koaResponseTime from 'koa-response-time'
import * as KoaRoles from 'koa-roles'
import * as KoaRouter from 'koa-router'
import * as koaStatic from 'koa-static'
import * as koaSslify from 'koa-sslify'
import * as koaViews from 'koa-views'

import * as _ from 'lodash'
import * as config from 'config'
import * as greenlock from 'greenlock-express'
import * as http from 'http'
import * as https from 'https'
import * as jwt from 'jsonwebtoken'
import * as path from 'path'
import * as spdy from 'spdy'

// =============================================

import { HttpRouter, HttpStatic } from '.'
import { SocketServer } from '../socket'
import { ApplicationOptions } from '../interfaces/application'
import { StaticProfile } from '../interfaces/static'

// =============================================

export class HttpServer {

    protected options: ApplicationOptions
    protected secret: string

    public koa: Koa = new Koa()
    public http: http.Server
    public https: https.Server
    public io: SocketServer
    public roles: KoaRoles
    public router: HttpRouter = new HttpRouter()
    public ssl: greenlock

    protected isProduction = "production" == process.env.NODE_ENV

    public static instance(opts?: ApplicationOptions): Application {
        return new HttpServer(opts)
    }

    constructor(opts?: ApplicationOptions) {

        // options
        this.options = _.defaults(opts || {}, {
            ssl: false
        })

        // secret
        this.secret = config.has('server.io.secret') ? config.get('server.io.secret') : 'a day in the core'

        // create koajs application & router
        // this.koa = new Koa()
        // this.router = new HttpRouter()

        // perform configuration
        this.protocol()
        this.middleware()        
        this.views()
        this.routes()
        // this.assets()
        // this.accessControl()
        // this.errors()

    }

    private accessControl(): void {
        
        let failureHandler = (ctx, action) => {
                
            let accepts = ctx.accepts('json', 'html')
            let msg = 'Access Denied - You don\'t have permission to: ' + action

            ctx.status = 403
            
            if ( accepts === 'json') {
                ctx.body = { message: msg } 
            } else if ( accepts === 'html') {
                ctx.render('forbidden', { message: msg })
            } else {
                ctx.body = msg
            }
        
        }

        this.roles = new KoaRoles({ failureHandler })

    }

    private assets(): void {
        
        // retrieve static paths from config
        let profiles: StaticProfile[]  = config.has('server.static') ? config.get('server.static') : []

        // enumerate paths
        profiles.forEach( (profile: StaticProfile) => {
            new HttpStatic(this.koa, profile)
        })

    }

    private errors(): void {

        // 404 Handler
        this.koa.use(async (ctx, next) => {
            try {
                await next()
                if ( ctx.status === 404 ) ctx.throw(404)
            } catch(err) {
                ctx.throw(err)
                ctx.app.emit('error', err, ctx)
            }
        })

        // override koa's undocumented error handler
        this.koa.context.onerror = koaBetterErrorHandler

    }

    private middleware(): void {
        
        // logger
        if (!this.isProduction) {
            this.koa.use( koaLogger() )
        }

        // x-response-time
        this.koa.use( koaResponseTime() )

        // pretty json
        this.koa.use( koaJson() )
        
        // compression
        this.koa.use( koaCompress() )

        // rate limit
        // this.koa.use(
        //     koaRateLimit(
        //         {
        //             max: opts.ratelimit,
        //             duration: opts.duration,
        //             db: redis.createClient()
        //         }
        //     )
        // )

        // body parser for json / forms
        this.koa.use( koaBodyParser() )

        // cookie provider
        this.koa.use( koaCookie() )

        // jwt
        this.koa.use( koaJwt({
            secret: this.secret,
            passthrough: true
        }) )

        // livereload
        if (!this.isProduction) {
            this.koa.use( koaLivereload(
                { src: "/components/livereload-js/dist/livereload.js?host=localhost&snipver=1" }
            ) )
        }
    
    }

    private protocol(): void {
        
        if (this.options.ssl === false) {
        
            this.http = http.createServer( this.koa.callback() )
            this.io = new SocketServer(this.http, {})
        
        } else {

            let approvedDomains = (opts, certs, cb) => {
                if (certs) {
                    opts.domains = certs.altnames;
                } else {
                    opts.domains = opts.domains;
                    opts.email = "andronics@gmail.com";
                    opts.agreeTos = false;
                }
                cb(null, { options: opts, certs: certs });
            }

            this.ssl = greenlock.create( {
                server: 'staging', // production or staging
                configDir: path.resolve(process.cwd(), './certs'),
                approveDomains: approvedDomains,
                debug: true
            } )
            
            this.http = http.createServer(
                this.ssl.middleware( (new Koa).use( koaSslify() ).callback())
            )
            
            this.https = spdy.createServer(
                { ecdhCurve: 'auto' },
                this.ssl.middleware( this.koa.callback() )
            )

            this.io = new SocketServer(this.https, {})
        
        }
    }

    private routes(): void {

        this.router.post( '/login', ctx => {
            
            let profile = {
                first_name: 'Stephen',
                last_name: 'Cox',
                email: 'andronics@gmail.com',
                id: 123
            }

            let token = jwt.sign(profile, this.secret, { expiresIn: "1d" })
            ctx.set("Bearer", token)
            ctx.body = { token: token }
        
        })

        // standard errors
        this.router.get( '/404', ctx => ctx.throw(404) )
        this.router.get( '/500', ctx => ctx.throw(500) )

        // use router middleware
        this.koa.use( this.router.routes() )
        this.koa.use( this.router.allowedMethods() )

    }

    private views(): void {

        let cfg = config.has('server.views') ? config.get('server.views') : {}

        // build options from defaults and config
        let options = _.defaultsDeep(cfg, {
            extension: 'pug',
            options: {
                helpers: {},
                locals: {}
            }
        })

        // use views middleware
        this.koa.use(
            koaViews(
                path.resolve(process.cwd(), 'views'),
                options
            )
        )

    }

    public use(...args): Koa {
        return this.koa.use.apply(this.koa, args)
    }

}