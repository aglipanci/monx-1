module.exports = {
	debug : true,
	api_url: 'http://localhost:3000/api/',
	email: {
		service: 'Gmail',
		auth: {
          user: 'monx.notifications@gmail.com',
          pass: 'asdayhri7werhvnssadni8as'
        },
        from: 'Monx <monx.notifications@gmail.com>'
	},
	logs: {
	    app: true,
	    blacklist: true,
	    checker: true,
	    emmiter: true,
	    emmiter_lib: true,
	    processor: true,
	    mailer: true
	}
}